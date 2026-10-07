declare namespace NodeJS {
  interface ProcessEnv { PUBLIC_REOWN_PROJECT_ID?: string }
}
declare module '@google/model-viewer/dist/model-viewer.min.js'
declare module '*.btsx' {
  import type { ComponentBody } from 'octane'
  const component: ComponentBody
  export default component
}
