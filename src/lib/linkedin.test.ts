import { describe, expect, it } from 'vitest';
import { normalizeLinkedin } from './linkedin';

describe('normalizeLinkedin', () => {
  it('fjerner protokol, www, forespørgsel og skråstreg', () => {
    expect(normalizeLinkedin('https://www.linkedin.com/in/Foo-Bar/?trk=x')).toBe('linkedin.com/in/foo-bar');
  });
  it('fjerner sprogunderdomæne', () => {
    expect(normalizeLinkedin('dk.linkedin.com/in/foo')).toBe('linkedin.com/in/foo');
  });
  it('giver null ved tom værdi', () => {
    expect(normalizeLinkedin('  ')).toBeNull();
    expect(normalizeLinkedin(null)).toBeNull();
  });
});
