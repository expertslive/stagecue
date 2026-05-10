// Filters are inlined in AppDbContext.OnModelCreating so they can reference
// AppDbContext.CurrentTenantId (a context-instance member EF parameterizes per query).
namespace EventStageTimer.Infrastructure.Persistence.ModelConfiguration;
