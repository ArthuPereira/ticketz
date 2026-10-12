import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const frontendDirectory = resolve(import.meta.dirname, '..')
const distDirectory = resolve(frontendDirectory, 'dist')
const apiUrl = process.env.VITE_API_URL?.trim().replace(/\/+$/, '')

if (!apiUrl) {
  throw new Error('VITE_API_URL deve ser informada para o build de produção.')
}

const parsedApiUrl = new URL(apiUrl)
if (parsedApiUrl.protocol !== 'https:') {
  throw new Error('VITE_API_URL deve usar HTTPS no build de produção.')
}

if (['localhost', '127.0.0.1', '::1'].includes(parsedApiUrl.hostname)) {
  throw new Error('VITE_API_URL não pode apontar para um endereço local em produção.')
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory() ? listFiles(path) : [path]
    }),
  )
  return nestedFiles.flat()
}

const files = await listFiles(distDirectory)
const indexPath = resolve(distDirectory, 'index.html')
if (!files.includes(indexPath)) {
  throw new Error('O build não gerou dist/index.html.')
}

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt'])
const textFiles = files.filter((file) => {
  const extension = file.slice(file.lastIndexOf('.'))
  return textExtensions.has(extension)
})
const contents = await Promise.all(textFiles.map((file) => readFile(file, 'utf8')))

// Dependências do React Router contêm uma URL genérica "http://localhost"
// usada apenas para interpretar caminhos. Endereços locais com porta indicam
// que uma configuração real de desenvolvimento vazou para o bundle.
const forbiddenAddress =
  /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::\d+)/i
if (contents.some((content) => forbiddenAddress.test(content))) {
  throw new Error('O build de produção ainda contém um endereço local.')
}

if (!contents.some((content) => content.includes(apiUrl))) {
  throw new Error('A URL pública da API não foi incorporada ao build.')
}

console.log(`Build de produção validado para ${apiUrl}.`)
