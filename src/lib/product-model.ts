export const PRODUCT_MODEL_URL = new URL('./scene/turbine__turbofan_engine__jet_engine.glb', import.meta.url).href

export const PRODUCT_VIEWS = [
  { id: 'perspective', label: 'Perspective', orbit: '35deg 75deg 105%' },
  { id: 'front', label: 'Front', orbit: '90deg 90deg 105%' },
  { id: 'side', label: 'Side', orbit: '0deg 90deg 105%' },
] as const
