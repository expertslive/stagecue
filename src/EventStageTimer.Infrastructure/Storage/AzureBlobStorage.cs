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
    private int _containerEnsured; // 0 = not yet, 1 = done

    public AzureBlobStorage(IOptions<AzureBlobStorageOptions> opts)
    {
        var o = opts.Value;
        if (string.IsNullOrWhiteSpace(o.ConnectionString))
            throw new InvalidOperationException("Storage:AzureBlob:ConnectionString is required");
        // Constructor stays sync — defer the network round-trip to the first real call
        // so a momentarily-unreachable storage account does not deadlock app startup.
        _container = new BlobContainerClient(o.ConnectionString, o.Container);
    }

    private async Task EnsureContainerAsync(CancellationToken ct)
    {
        if (Interlocked.CompareExchange(ref _containerEnsured, 1, 0) == 0)
        {
            try
            {
                await _container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: ct);
            }
            catch
            {
                Interlocked.Exchange(ref _containerEnsured, 0); // retry on next call
                throw;
            }
        }
    }

    public async Task<string> SaveAsync(Stream content, string contentType, CancellationToken ct)
    {
        await EnsureContainerAsync(ct);
        var key = $"{Guid.NewGuid():N}{ExtFor(contentType)}";
        var blob = _container.GetBlobClient(key);
        await blob.UploadAsync(content, new BlobHttpHeaders { ContentType = contentType }, cancellationToken: ct);
        return key;
    }

    public async Task<(Stream Content, string ContentType)?> OpenAsync(string key, CancellationToken ct)
    {
        await EnsureContainerAsync(ct);
        var blob = _container.GetBlobClient(key);
        if (!await blob.ExistsAsync(ct)) return null;
        var resp = await blob.DownloadContentAsync(ct);
        var stream = resp.Value.Content.ToStream();
        var contentType = resp.Value.Details.ContentType ?? "application/octet-stream";
        return (stream, contentType);
    }

    public async Task DeleteAsync(string key, CancellationToken ct)
    {
        await EnsureContainerAsync(ct);
        await _container.GetBlobClient(key).DeleteIfExistsAsync(cancellationToken: ct);
    }

    private static string ExtFor(string ct) => ct switch
    {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        _ => "",
    };
}
