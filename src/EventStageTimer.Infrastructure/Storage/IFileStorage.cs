namespace EventStageTimer.Infrastructure.Storage;

public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, string contentType, CancellationToken ct);
    Task<(Stream Content, string ContentType)?> OpenAsync(string key, CancellationToken ct);
    Task DeleteAsync(string key, CancellationToken ct);
}

public sealed class LocalFileStorageOptions
{
    public string Root { get; set; } = "./uploads";
}
