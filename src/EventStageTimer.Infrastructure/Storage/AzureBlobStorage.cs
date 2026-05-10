using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace EventStageTimer.Infrastructure.Storage;

public sealed class AzureBlobStorageOptions
{
    public string ConnectionString { get; set; } = "";
    public string Container { get; set; } = "uploads";
}

public sealed class AzureBlobStorage : IFileStorage
{
    private readonly BlobContainerClient _container;

    public AzureBlobStorage(IOptions<AzureBlobStorageOptions> opts)
    {
        var o = opts.Value;
        if (string.IsNullOrWhiteSpace(o.ConnectionString))
            throw new InvalidOperationException("Storage:AzureBlob:ConnectionString is required");
        _container = new BlobContainerClient(o.ConnectionString, o.Container);
        _container.CreateIfNotExists(PublicAccessType.None);
    }

    public async Task<string> SaveAsync(Stream content, string contentType, CancellationToken ct)
    {
        var key = $"{Guid.NewGuid():N}{ExtFor(contentType)}";
        var blob = _container.GetBlobClient(key);
        await blob.UploadAsync(content, new BlobHttpHeaders { ContentType = contentType }, cancellationToken: ct);
        return key;
    }

    public async Task<(Stream Content, string ContentType)?> OpenAsync(string key, CancellationToken ct)
    {
        var blob = _container.GetBlobClient(key);
        if (!await blob.ExistsAsync(ct)) return null;
        var resp = await blob.DownloadContentAsync(ct);
        var stream = resp.Value.Content.ToStream();
        var contentType = resp.Value.Details.ContentType ?? "application/octet-stream";
        return (stream, contentType);
    }

    public async Task DeleteAsync(string key, CancellationToken ct)
    {
        await _container.GetBlobClient(key).DeleteIfExistsAsync(cancellationToken: ct);
    }

    private static string ExtFor(string ct) => ct switch
    {
        "image/png" => ".png",
        "image/svg+xml" => ".svg",
        "image/jpeg" => ".jpg",
        _ => "",
    };
}
