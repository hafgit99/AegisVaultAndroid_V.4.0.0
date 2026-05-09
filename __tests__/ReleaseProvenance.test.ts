const provenance = require('../scripts/generate-release-provenance');

describe('release provenance generator', () => {
  it('builds a CycloneDX SBOM with application metadata', () => {
    const sbom = provenance.buildSbom();

    expect(sbom).toMatchObject({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      metadata: {
        component: {
          type: 'application',
          name: 'AegisAndroid',
        },
      },
    });
    expect(sbom.components.length).toBeGreaterThan(0);
  });

  it('builds provenance with source, materials, SBOM, and artifact fields', () => {
    const manifest = provenance.buildProvenance('aegis-android-sbom.cdx.json');

    expect(manifest).toMatchObject({
      schemaVersion: 'https://aegis-vault.dev/provenance/android-release/v1',
      subject: {
        name: 'AegisAndroid',
        packageName: 'com.aegisandroid',
      },
      sbom: {
        path: 'release-artifacts/aegis-android-sbom.cdx.json',
      },
    });
    expect(manifest.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'package-lock.json',
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
    expect(Array.isArray(manifest.artifacts)).toBe(true);
  });
});
