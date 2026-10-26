
describe("server-nested manual publication facts (bizgenie-api #218)", () => {
  it("publicationFor prefers the variant's nested record and maps record_id", async () => {
    const { publicationFor } = await import("./ManualPublicationPanel");
    expect(publicationFor({}, { publication: { record_id: "p9", published_at: "2026-10-26T10:00:00Z", publication_url: "https://example.test/x", method: "manual", evidence_kind: "customer_attestation" } })).toEqual({ publication_id: "p9", published_at: "2026-10-26T10:00:00Z", publication_url: "https://example.test/x" });
    expect(publicationFor({}, { publication: null })).toBeNull();
  });
});
