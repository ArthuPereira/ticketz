from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Optional
from zoneinfo import ZoneInfo

from PIL import Image
import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


@dataclass
class DadosIngressoPDF:
    ingresso_id: int
    codigo: str
    evento_nome: str
    evento_data: datetime
    evento_local: str
    usuario_nome: str
    usuario_email: str


try:
    TZ_LOCAL = ZoneInfo("America/Fortaleza")
except Exception:
    TZ_LOCAL = timezone.utc


def limpar_texto(texto: Optional[str]) -> str:
    """Remove caracteres fora da tabela latin-1 (como emojis) que causam falhas nas fontes Helvetica do ReportLab."""
    if not texto:
        return ""
    return "".join(c for c in texto if ord(c) < 256)


def formatar_data(dt: datetime) -> str:
    """Converte a data UTC para o horário local (America/Fortaleza) e formata."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt_local = dt.astimezone(TZ_LOCAL)
    return dt_local.strftime("%d/%m/%Y às %H:%M (%Z)")


def gerar_qr_code_bytes(conteudo: str) -> BytesIO:
    """Gera a imagem do QR Code contendo o código UUID do ingresso em memória."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(conteudo)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def gerar_pdf(dados: DadosIngressoPDF) -> bytes:
    """Gera o documento PDF do ingresso em memória (BytesIO) com QR Code e detalhes do evento."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()

    # Estilos customizados
    titulo_style = ParagraphStyle(
        "TicketzTitulo",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1E293B"),
        alignment=1,  # Centralizado
    )

    subtitulo_style = ParagraphStyle(
        "TicketzSubtitulo",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748B"),
        alignment=1,
    )

    evento_nome_style = ParagraphStyle(
        "EventoNome",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#0F172A"),
    )

    label_style = ParagraphStyle(
        "LabelStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748B"),
    )

    valor_style = ParagraphStyle(
        "ValorStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#1E293B"),
    )

    story = []

    # Cabeçalho
    story.append(Paragraph("TICKETZ", titulo_style))
    story.append(Paragraph("Comprovante Oficial de Ingresso", subtitulo_style))
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E1"), spaceAfter=15))

    # Nome do evento (com quebra automática para até 150 caracteres)
    story.append(Paragraph(limpar_texto(dados.evento_nome), evento_nome_style))
    story.append(Spacer(1, 15))

    # Tabela com dados do evento e do titular
    data_formatada = formatar_data(dados.evento_data)
    tabela_dados = [
        [
            Paragraph("DATA E HORA", label_style),
            Paragraph("LOCAL", label_style),
        ],
        [
            Paragraph(data_formatada, valor_style),
            Paragraph(limpar_texto(dados.evento_local), valor_style),
        ],
        [
            Spacer(1, 5),
            Spacer(1, 5),
        ],
        [
            Paragraph("PARTICIPANTE", label_style),
            Paragraph("E-MAIL", label_style),
        ],
        [
            Paragraph(limpar_texto(dados.usuario_nome), valor_style),
            Paragraph(limpar_texto(dados.usuario_email), valor_style),
        ],
        [
            Spacer(1, 5),
            Spacer(1, 5),
        ],
        [
            Paragraph("NÚMERO DO INGRESSO", label_style),
            Paragraph("CÓDIGO DE VALIDAÇÃO", label_style),
        ],
        [
            Paragraph(f"#{dados.ingresso_id}", valor_style),
            Paragraph(dados.codigo, valor_style),
        ],
    ]

    tabela = Table(tabela_dados, colWidths=[240, 275])
    tabela.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
        ])
    )
    story.append(tabela)
    story.append(Spacer(1, 20))

    # QR Code
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E1"), spaceAfter=15))
    qr_buf = gerar_qr_code_bytes(dados.codigo)
    qr_img = RLImage(qr_buf, width=150, height=150)
    qr_img.hAlign = "CENTER"
    story.append(qr_img)
    story.append(Spacer(1, 8))

    qr_legenda = ParagraphStyle(
        "QRLegenda",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#94A3B8"),
        alignment=1,
    )
    story.append(Paragraph("Apresente este QR Code na entrada do evento para validação.", qr_legenda))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
