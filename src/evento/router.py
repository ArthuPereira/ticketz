from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user_optional, require_organizer
from src.core.action_log import consultar_logs_evento, registrar_log
from src.core.cache import (
    get_lista_versao,
    get_or_set,
    invalidar_escrita_evento,
)
from src.core.database import get_db
from src.core.models import Evento, Ingresso, Usuario
from src.core.s3 import delete_object, gerar_presigned_url, upload_banner
from src.evento.dependencies import get_evento_do_organizador
from src.evento.schema import (
    ActionLogPagina,
    EventoCreate,
    EventoPagina,
    EventoResponse,
    EventoUpdate,
    MeuIngressoResumo,
)

router = APIRouter(
    prefix="/eventos",
    tags=["Eventos"],
)


@router.post(
    "",
    response_model=EventoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar novo evento (apenas organizadores)",
)
async def criar_evento(
    evento_in: EventoCreate,
    current_user: Annotated[Usuario, Depends(require_organizer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Cria um novo evento atribuindo o organizador_id do token autenticado
    e definindo ingressos_disponiveis igual a total_ingressos."""
    novo_evento = Evento(
        organizador_id=current_user.id,
        nome=evento_in.nome,
        descricao=evento_in.descricao,
        local=evento_in.local,
        data=evento_in.data,
        total_ingressos=evento_in.total_ingressos,
        ingressos_disponiveis=evento_in.total_ingressos,
        banner_key=evento_in.banner_key,
        ativo=True,
    )

    db.add(novo_evento)
    await db.commit()
    await db.refresh(novo_evento)

    # Log de auditoria no DynamoDB
    await registrar_log(
        entidade=f"evento#{novo_evento.id}",
        acao="CREATE_EVENT",
        usuario_id=current_user.id,
        dados={
            "nome": novo_evento.nome,
            "descricao": novo_evento.descricao,
            "local": novo_evento.local,
            "total_ingressos": novo_evento.total_ingressos,
            "data": novo_evento.data.isoformat(),
            "organizador_id": novo_evento.organizador_id,
        },
    )

    # Invalidação do cache Redis (sobe a versão da lista)
    await invalidar_escrita_evento(novo_evento.id)

    resp = EventoResponse.model_validate(novo_evento)
    if resp.banner_key:
        resp.banner_url = gerar_presigned_url(resp.banner_key)
    return resp


@router.get(
    "",
    response_model=EventoPagina,
    status_code=status.HTTP_200_OK,
    summary="Listar eventos públicos (apenas ativos e futuros)",
)
async def listar_eventos(
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
    limit: Annotated[int, Query(ge=1, le=100, description="Máximo de itens")] = 20,
    offset: Annotated[int, Query(ge=0, description="Deslocamento inicial")] = 0,
):
    """Vitrine pública com cache-aside por versão (TTL 30s) e header X-Cache."""
    versao = await get_lista_versao()
    chave_cache = f"eventos:lista:v{versao}:{limit}:{offset}"

    async def carregar_lista():
        condicoes = [
            Evento.ativo.is_(True),
            Evento.data > func.now(),
        ]

        total_stmt = select(func.count(Evento.id)).where(*condicoes)
        total = await db.scalar(total_stmt) or 0

        query = (
            select(Evento)
            .where(*condicoes)
            .order_by(Evento.data.asc(), Evento.id.asc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.scalars(query)
        items = list(result.all())

        pagina = EventoPagina(
            items=[EventoResponse.model_validate(ev) for ev in items],
            total=total,
            limit=limit,
            offset=offset,
        )
        return pagina.model_dump(mode="json")

    dados, hit = await get_or_set(chave_cache, ttl=30, carregar=carregar_lista)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"

    pagina_resp = EventoPagina(**dados)

    # Assina presigned URLs para os banners após a leitura do cache
    for item in pagina_resp.items:
        if item.banner_key:
            item.banner_url = gerar_presigned_url(item.banner_key)

    return pagina_resp


@router.get(
    "/meus",
    response_model=EventoPagina,
    status_code=status.HTTP_200_OK,
    summary="Listar eventos do organizador logado",
)
async def listar_meus_eventos(
    current_user: Annotated[Usuario, Depends(require_organizer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100, description="Máximo de itens")] = 20,
    offset: Annotated[int, Query(ge=0, description="Deslocamento inicial")] = 0,
):
    """Histórico do organizador: retorna todos os seus eventos ativos (inclusive passados)."""
    condicoes = [
        Evento.organizador_id == current_user.id,
        Evento.ativo.is_(True),
    ]

    total_stmt = select(func.count(Evento.id)).where(*condicoes)
    total = await db.scalar(total_stmt) or 0

    query = (
        select(Evento)
        .where(*condicoes)
        .order_by(Evento.data.asc(), Evento.id.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.scalars(query)
    items = list(result.all())

    items_resp: list[EventoResponse] = []
    for ev in items:
        resp_ev = EventoResponse.model_validate(ev)
        if resp_ev.banner_key:
            resp_ev.banner_url = gerar_presigned_url(resp_ev.banner_key)
        items_resp.append(resp_ev)

    return EventoPagina(items=items_resp, total=total, limit=limit, offset=offset)


@router.get(
    "/{id}",
    response_model=EventoResponse,
    status_code=status.HTTP_200_OK,
    summary="Obter detalhes de um evento",
)
async def obter_evento(
    id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
    current_user: Annotated[Usuario | None, Depends(get_current_user_optional)] = None,
):
    """Retorna detalhes de um evento ativo pelo ID com cache-aside (TTL 60s) e header X-Cache.
    meu_ingresso e presigned banner_url são montados pós-cache."""
    async def carregar_evento():
        stmt = select(Evento).where(Evento.id == id, Evento.ativo.is_(True))
        result = await db.execute(stmt)
        ev = result.scalar_one_or_none()
        if ev is None:
            return None
        resp_base = EventoResponse.model_validate(ev)
        return resp_base.model_dump(mode="json")

    chave_cache = f"evento:{id}"
    dados, hit = await get_or_set(chave_cache, ttl=60, carregar=carregar_evento)

    response.headers["X-Cache"] = "HIT" if hit else "MISS"

    if dados is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado",
        )

    evento_resp = EventoResponse(**dados)

    # 1. Se usuário autenticado, monta meu_ingresso consultando o banco
    if current_user is not None:
        ing_stmt = select(Ingresso.id, Ingresso.status).where(
            Ingresso.evento_id == id,
            Ingresso.usuario_id == current_user.id,
        )
        ing_row = (await db.execute(ing_stmt)).first()
        if ing_row is not None:
            evento_resp.meu_ingresso = MeuIngressoResumo(
                id=ing_row.id,
                status=ing_row.status,
            )

        # Log de leitura (READ) para usuários identificados
        await registrar_log(
            entidade=f"evento#{id}",
            acao="READ_EVENT",
            usuario_id=current_user.id,
            dados={"evento_id": id},
        )

    # 2. Gera URL assinada temporária (1h)
    if evento_resp.banner_key:
        evento_resp.banner_url = gerar_presigned_url(evento_resp.banner_key)

    return evento_resp


@router.put(
    "/{id}",
    response_model=EventoResponse,
    status_code=status.HTTP_200_OK,
    summary="Atualizar evento (apenas dono do evento)",
)
async def atualizar_evento(
    evento_in: EventoUpdate,
    evento: Annotated[Evento, Depends(get_evento_do_organizador)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Atualização parcial do evento. Não permite alterar total_ingressos na v1."""
    campos_atualizar = evento_in.model_dump(exclude_unset=True)

    dados_anteriores = {k: getattr(evento, k) for k in campos_atualizar.keys()}
    for campo, valor in campos_atualizar.items():
        setattr(evento, campo, valor)

    evento.atualizado_em = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(evento)

    dados_novos = {k: getattr(evento, k) for k in campos_atualizar.keys()}

    # Log no DynamoDB com antes e depois
    await registrar_log(
        entidade=f"evento#{evento.id}",
        acao="UPDATE_EVENT",
        usuario_id=evento.organizador_id,
        dados={"antes": dados_anteriores, "depois": dados_novos},
    )

    # Invalidação do cache Redis
    await invalidar_escrita_evento(evento.id)

    resp = EventoResponse.model_validate(evento)
    if resp.banner_key:
        resp.banner_url = gerar_presigned_url(resp.banner_key)
    return resp


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover evento (soft delete pelo dono)",
)
async def deletar_evento(
    evento: Annotated[Evento, Depends(get_evento_do_organizador)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Soft delete do evento: marca ativo=False para preservar ingressos já emitidos."""
    evento.ativo = False
    evento.atualizado_em = datetime.now(timezone.utc)

    await db.commit()

    # Log no DynamoDB
    await registrar_log(
        entidade=f"evento#{evento.id}",
        acao="DELETE_EVENT",
        usuario_id=evento.organizador_id,
        dados={"nome": evento.nome, "organizador_id": evento.organizador_id},
    )

    # Invalidação do cache Redis
    await invalidar_escrita_evento(evento.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{id}/banner",
    response_model=EventoResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload de imagem de banner para o evento (apenas dono)",
)
async def post_banner_evento(
    evento: Annotated[Evento, Depends(get_evento_do_organizador)],
    arquivo: Annotated[UploadFile, File(...)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Upload multipart (campo 'arquivo') de até 5MB em JPEG/PNG/WebP para o bucket S3."""
    antigo_key = evento.banner_key

    # Upload para o S3 com validação via Pillow
    nova_key = await upload_banner(evento.id, arquivo)

    evento.banner_key = nova_key
    evento.atualizado_em = datetime.now(timezone.utc)

    try:
        await db.commit()
        await db.refresh(evento)
    except Exception as e:
        await db.rollback()
        # Se o commit falhar, remove o objeto recém-criado para evitar órfão
        await delete_object(nova_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao salvar referência do banner no banco de dados",
        )

    # Apaga o objeto antigo no S3 (sem falhar a requisição se der erro)
    if antigo_key and antigo_key != nova_key:
        await delete_object(antigo_key)

    # Log de auditoria no DynamoDB
    await registrar_log(
        entidade=f"evento#{evento.id}",
        acao="UPLOAD_BANNER",
        usuario_id=evento.organizador_id,
        dados={"banner_key": nova_key},
    )

    # Invalidação do cache Redis
    await invalidar_escrita_evento(evento.id)

    resp = EventoResponse.model_validate(evento)
    resp.banner_url = gerar_presigned_url(evento.banner_key)
    return resp


@router.get(
    "/{id}/logs",
    response_model=ActionLogPagina,
    status_code=status.HTTP_200_OK,
    summary="Consultar logs de auditoria do evento (apenas dono)",
)
async def get_logs_evento(
    evento: Annotated[Evento, Depends(get_evento_do_organizador)],
    limit: Annotated[int, Query(ge=1, le=100, description="Máximo de itens")] = 20,
    cursor: Annotated[Optional[str], Query(description="Cursor de paginação")] = None,
):
    """Retorna os logs de auditoria da entidade evento#{id} ordenados dos mais recentes aos mais antigos."""
    resultado = await consultar_logs_evento(evento_id=evento.id, limit=limit, cursor=cursor)
    return ActionLogPagina(**resultado)
