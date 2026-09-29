import { defineConfig } from 'vite'

const [owner, repository] = process.env.GITHUB_REPOSITORY?.split('/') ?? []
const isRootPagesRepository = owner && repository?.toLowerCase() === `${owner.toLowerCase()}.github.io`
const base = process.env.VITE_BASE_PATH ?? (repository && !isRootPagesRepository ? `/${repository}/` : '/')

export default defineConfig({ base })
