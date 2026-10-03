class ErroNegocio(Exception):
    """Exceção para erros de regras de negócio com código de erro estruturado."""

    def __init__(self, codigo: str, mensagem: str, status_code: int = 409):
        self.codigo = codigo
        self.mensagem = mensagem
        self.status_code = status_code
        super().__init__(mensagem)
