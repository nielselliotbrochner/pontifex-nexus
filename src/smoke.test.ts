import { describe, it, expect } from 'vitest';
import { SUPABASE_URL } from './config';

describe('config', () => {
  it('peger på Nexus-projektet', () => {
    expect(SUPABASE_URL).toContain('nsyimhnqldwxidhajfut');
  });
});
