import { describe, expect, mock, test } from 'bun:test'
import { createJournal, type TransactionRecord } from '../../src/lib/appkit/journal'

const record = (id = 1): TransactionRecord => ({ id: String(id), hash: `0x${id.toString(16).padStart(64, '0')}`, network: 'ethereum', from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222', symbol: 'ETH', amount: '0.1', created: 1_700_000_000_000, status: 'pending' })
function storage(initial = '[]') {
  let value = initial
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next } }
}
describe('device transaction journal', () => {
  test('persists new transfers and receipt status across instances', () => {
    const disk = storage()
    const journal = createJournal(disk)
    const listener = mock(() => {})
    const unsubscribe = journal.subscribe(listener)
    journal.add(record())
    journal.update('1', { status: 'confirmed' })
    expect(createJournal(disk).getSnapshot()).toEqual([{ ...record(), status: 'confirmed' }])
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    journal.update('1', { status: 'reverted' })
    expect(listener).toHaveBeenCalledTimes(2)
  })
  test('ignores corrupt JSON and filters invalid or duplicate records', () => {
    expect(createJournal(storage('{bad')).getSnapshot()).toEqual([])
    const entries = [record(), record(), { ...record(2), network: 'unknown' }, { ...record(3), amount: '0' }, { ...record(4), amount: '1e3' }, { ...record(5), hash: 'invalid' }, { ...record(6), created: 9e15 }, { ...record(7), symbol: 'UNKNOWN' }, { ...record(8), to: 'bad' }]
    expect(createJournal(storage(JSON.stringify(entries))).getSnapshot()).toEqual([record()])
  })
  test('prevents duplicate hashes and retains the newest 100 entries', () => {
    const journal = createJournal(storage())
    for (let id = 1; id <= 101; id++) journal.add(record(id))
    journal.add({ ...record(101), id: 'duplicate' })
    expect(journal.getSnapshot()).toHaveLength(100)
    expect(journal.getSnapshot()[0]?.id).toBe('101')
    expect(journal.getSnapshot().at(-1)?.id).toBe('2')
  })
  test('keeps session history when storage is unavailable and rejects invalid updates', () => {
    const journal = createJournal({ getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') } })
    const original = record()
    journal.add(original)
    original.amount = '999'
    expect(journal.getSnapshot()[0]?.amount).toBe('0.1')
    expect(() => journal.update('1', { hash: 'bad' })).toThrow('Invalid transaction update')
    expect(journal.getSnapshot()[0]?.hash).toBe(record().hash)
  })
  test('reloads history changed or cleared by another tab', () => {
    const disk = storage(JSON.stringify([record()]))
    const journal = createJournal(disk)
    disk.setItem('block.transactions.v1', '[]')
    journal.reload()
    expect(journal.getSnapshot()).toEqual([])
  })
})
