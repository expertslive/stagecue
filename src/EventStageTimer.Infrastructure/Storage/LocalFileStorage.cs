using Microsoft.Extensions.Options;

namespace EventStageTimer.Infrastructure.Storage;

public sealed class LocalFileStorage(IOptions<LocalFileStorageOptions> opts) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(opts.Value.Root);

    public async Task<string> SaveAsync(Stream content, string contentType, CancellationToken ct)
    {
        Directory.CreateDirectory(_root);
        var key = $"{Guid.NewGuid():N}{ExtFor(contentType)}";
        var path = Path.Combine(_root, key);
        await using var fs = File.Create(path);
        await content.CopyToAsync(fs, ct);
        await File.WriteAllTextAsync(path + ".type", contentType, ct);
        return key;
    }

    public async Task<(Stream Content, string ContentType)?> OpenAsync(string key, CancellationToken ct)
    {
        var path = Path.Combine(_root, key);
        if (!File.Exists(path)) return null;
        var contentType = File.Exists(path + ".type") ? await File.ReadAllTextAsync(path + ".type", ct) : "application/octet-stream";
        return (File.OpenRead(path), contentType);
    }

    public Task DeleteAsync(string key, CancellationToken ct)
    {
        var path = Path.Combine(_root, key);
        if (File.Exists(path)) File.Delete(path);
        if (File.Exists(path + ".type")) File.Delete(path + ".type");
        return Task.CompletedTask;
    }

    private static string ExtFor(string ct) => ct switch
    {
        "image/png" => ".png",
        "image/svg+xml" => ".svg",
        "image/jpeg" => ".jpg",
        _ => "",
    };
}
