import { describe, expect, test } from 'bun:test'
import { validateRelaySettings } from '../../src/lib/relay-monitor'
const valid = { network: 'sepolia' as const, relay: `0x${'1'.repeat(40)}`, destination: `0x${'2'.repeat(40)}` }
describe('relay settings', () => {
  test('validates addresses and trims pasted whitespace', () => {
    expect(validateRelaySettings({ ...valid, relay: ` ${valid.relay} ` })).toEqual(valid)
  })
  test('rejects invalid, zero, identical addresses and unsupported networks', () => {
    for (const patch of [{ relay: 'invalid' }, { destination: `0x${'0'.repeat(40)}` }, { destination: valid.relay }, { network: 'bitcoin' as const }]) {
      expect(() => validateRelaySettings({ ...valid, ...patch })).toThrow()
    }
  })
})
