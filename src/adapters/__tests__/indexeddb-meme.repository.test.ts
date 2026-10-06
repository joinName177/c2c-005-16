import { describe, expect, it } from 'vitest';
import { IndexedDbMemeRepository, type MemeStoreDriver } from '../indexeddb-meme.repository';
import { coverPresetFor } from '../../core/cover-presets';
import type { VoiceMeme } from '../../core/models';
const meme = (): VoiceMeme => ({ id: '1', title: '原名', emotion: '温柔姐姐', confidence: .8, features: { loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2 }, audio: new Blob(['audio']), duration: 1, cover: new Blob(['cover']), coverConfig: coverPresetFor('温柔姐姐'), createdAt: '2026-10-05' });
class MemoryDriver implements MemeStoreDriver { data = new Map<string, VoiceMeme>(); async list(){return [...this.data.values()]} async put(value: VoiceMeme){this.data.set(value.id,value)} async delete(id:string){this.data.delete(id)} }

describe('IndexedDbMemeRepository', () => {
  it('round trips blobs and supports rename and delete', async () => {
    const repo = new IndexedDbMemeRepository(new MemoryDriver()); await repo.save(meme());
    expect((await repo.list())[0].audio.size).toBe(5); await repo.rename('1','新名字'); expect((await repo.list())[0].title).toBe('新名字'); await repo.delete('1'); expect(await repo.list()).toEqual([]);
  });
  it('surfaces storage quota failures', async () => {
    const driver: MemeStoreDriver = { list: async()=>[], put: async()=>{throw new DOMException('full','QuotaExceededError')}, delete:async()=>{} };
    await expect(new IndexedDbMemeRepository(driver).save(meme())).rejects.toThrow('full');
  });
});
