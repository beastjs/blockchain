import { useEffect, useState } from 'octane'
export function useQR(value?: string) {
  const [result, setResult] = useState<{ value: string; image?: string; error?: string }>({ value: '' })
  useEffect(() => {
    let active = true
    if (value) void import('qrcode').then(module => module.toDataURL(value, { width: 248, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#151713', light: '#f1f3ec' } }))
      .then(image => { if (active) setResult({ value, image }) })
      .catch(() => { if (active) setResult({ value, error: 'Unable to generate QR code.' }) })
    return () => { active = false }
  }, [value])
  return result.value === value ? result : { value: value ?? '' }
}
