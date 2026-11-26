export const webURL = (process.env.NEXT_PUBLIC_WEB_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100').replace(/\/+$/, '')
