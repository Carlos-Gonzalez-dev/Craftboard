declare module 'grid-layout-plus' {
  import { DefineComponent } from 'vue'

  export interface LayoutItem {
    i: string
    x: number
    y: number
    w: number
    h: number
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
    moved?: boolean
    static?: boolean
  }

  export const GridLayout: DefineComponent<any, any, any>
  export const GridItem: DefineComponent<any, any, any>

  export default GridLayout
}
