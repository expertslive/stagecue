using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using FluentAssertions;
using System.Net;
using System.Net.Http.Headers;
using Xunit;

namespace EventStageTimer.Api.Tests.Controllers;

[Collection("sqlserver")]
public sealed class BrandingControllerTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A + IHDR chunk stub.
    private static byte[] MinimalPng() => new byte[]
    {
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
    };

    // JPEG signature: FF D8 FF + EOI.
    private static byte[] MinimalJpeg() => new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00, 0xFF, 0xD9 };

    [Fact]
    public async Task Upload_accepts_PNG_with_matching_content_type()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var resp = await UploadAsync(seeded.EventId, MinimalPng(), "image/png", "logo.png");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Upload_accepts_JPEG_with_matching_content_type()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var resp = await UploadAsync(seeded.EventId, MinimalJpeg(), "image/jpeg", "logo.jpg");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Upload_rejects_SVG()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var svg = System.Text.Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
        var resp = await UploadAsync(seeded.EventId, svg, "image/svg+xml", "logo.svg");
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Upload_rejects_PNG_declared_as_JPEG()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var resp = await UploadAsync(seeded.EventId, MinimalPng(), "image/jpeg", "spoofed.jpg");
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Upload_rejects_garbage_declared_as_PNG()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var garbage = new byte[] { 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B };
        var resp = await UploadAsync(seeded.EventId, garbage, "image/png", "fake.png");
        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Get_logo_returns_CSP_and_nosniff_headers()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        (await UploadAsync(seeded.EventId, MinimalPng(), "image/png", "logo.png")).EnsureSuccessStatusCode();

        var anon = _factory.CreateClient();
        var resp = await anon.GetAsync($"/api/events/{seeded.EventId}/branding/logo");
        resp.EnsureSuccessStatusCode();
        resp.Headers.GetValues("Content-Security-Policy").Single()
            .Should().Be("default-src 'none'; img-src 'self'; sandbox");
        resp.Headers.GetValues("X-Content-Type-Options").Single().Should().Be("nosniff");
    }

    private Task<HttpResponseMessage> UploadAsync(Guid eventId, byte[] content, string contentType, string filename)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", filename);
        return _http.PostAsync($"/api/events/{eventId}/branding/logo", form);
    }
}
