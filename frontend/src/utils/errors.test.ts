import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/client'
import {
  getApiErrorCode,
  getApiFieldErrors,
  getUserErrorMessage,
} from './errors'

describe('getUserErrorMessage', () => {
  it.each([
    ['JA_POSSUI_INGRESSO', 'Você já possui um ingresso para este evento.'],
    ['ESGOTADO', 'Os ingressos deste evento estão esgotados.'],
    ['EVENTO_ENCERRADO', 'Este evento já foi encerrado.'],
    ['INGRESSO_NAO_PRONTO', 'Seu ingresso ainda está sendo preparado.'],
    ['INGRESSO_NAO_FAILED', 'Este ingresso não precisa ser reprocessado.'],
  ])('mapeia o código %s', (codigo, expectedMessage) => {
    const error = new ApiError(409, { codigo }, 'Erro de negócio')

    expect(getUserErrorMessage(error)).toBe(expectedMessage)
  })

  it.each([
    [401, 'Sua sessão expirou. Entre novamente.'],
    [403, 'Você não tem permissão para realizar esta ação.'],
    [404, 'O conteúdo solicitado não foi encontrado.'],
    [413, 'A imagem deve ter no máximo 5 MB.'],
    [415, 'Escolha uma imagem JPEG, PNG ou WebP válida.'],
    [500, 'Não foi possível concluir a operação.'],
    [503, 'O serviço está temporariamente indisponível.'],
  ])('mapeia o status HTTP %i', (status, expectedMessage) => {
    const error = new ApiError(status, null, 'Erro')

    expect(getUserErrorMessage(error)).toBe(expectedMessage)
  })

  it('usa mensagem neutra para credenciais inválidas no login', () => {
    const error = new ApiError(401, 'Credenciais inválidas', 'Credenciais inválidas')

    expect(getUserErrorMessage(error, 'login')).toBe('Credenciais inválidas.')
  })

  it('preserva uma mensagem textual quando não existe mapeamento específico', () => {
    const error = new ApiError(409, 'E-mail já cadastrado', 'E-mail já cadastrado')

    expect(getUserErrorMessage(error)).toBe('E-mail já cadastrado')
  })

  it('trata falhas de rede como indisponibilidade temporária', () => {
    expect(getUserErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'O serviço está temporariamente indisponível.',
    )
  })

  it('usa mensagem segura para erros desconhecidos', () => {
    expect(getUserErrorMessage(new Error('Detalhe interno'))).toBe(
      'Não foi possível concluir a operação.',
    )
  })
})

describe('erros estruturados', () => {
  it('extrai o código de detail sem assumir que ele sempre existe', () => {
    expect(
      getApiErrorCode(
        new ApiError(409, { codigo: 'ESGOTADO', mensagem: 'Sem estoque' }, 'Erro'),
      ),
    ).toBe('ESGOTADO')
    expect(getApiErrorCode(new ApiError(404, 'Não encontrado', 'Erro'))).toBeNull()
  })

  it('associa erros 422 aos campos correspondentes', () => {
    const error = new ApiError(
      422,
      [
        { loc: ['body', 'email'], msg: 'Informe um e-mail válido.' },
        { loc: ['body', 'senha'], msg: 'Use pelo menos oito caracteres.' },
      ],
      'Erro de validação',
    )

    expect(getApiFieldErrors(error)).toEqual({
      email: 'Informe um e-mail válido.',
      senha: 'Use pelo menos oito caracteres.',
    })
  })

  it('ignora estruturas 422 que não identificam um campo', () => {
    const error = new ApiError(422, [{ mensagem: 'inválido' }], 'Erro')

    expect(getApiFieldErrors(error)).toEqual({})
  })
})
