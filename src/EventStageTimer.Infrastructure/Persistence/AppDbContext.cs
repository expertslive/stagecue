using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence.ModelConfiguration;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenantContext)
    : IdentityDbContext<User, IdentityRole<Guid>, Guid>(options)
{
    private readonly ITenantContext _tenantContext = tenantContext;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventMembership> EventMemberships => Set<EventMembership>();
    public DbSet<EventMembershipRoom> EventMembershipRooms => Set<EventMembershipRoom>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<InvitationRoom> InvitationRooms => Set<InvitationRoom>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<ScheduleItem> ScheduleItems => Set<ScheduleItem>();
    public DbSet<ScheduleItemRun> ScheduleItemRuns => Set<ScheduleItemRun>();
    public DbSet<RoomTimerState> RoomTimerStates => Set<RoomTimerState>();
    public DbSet<MessageTemplate> MessageTemplates => Set<MessageTemplate>();
    public DbSet<AuditLogEntry> AuditLog => Set<AuditLogEntry>();
    public DbSet<AuthMagicLink> AuthMagicLinks => Set<AuthMagicLink>();
    public DbSet<EmailOutbox> EmailOutbox => Set<EmailOutbox>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b); // Identity tables

        // Tenant
        b.Entity<Tenant>(e =>
        {
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Slug).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(200);
        });

        // User
        b.Entity<User>(e =>
        {
            e.Property(x => x.DisplayName).HasMaxLength(200);
        });

        // TenantMembership
        b.Entity<TenantMembership>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.UserId }).IsUnique();
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.User).WithMany(u => u.TenantMemberships).HasForeignKey(x => x.UserId);
        });

        // Event
        b.Entity<Event>(e =>
        {
            e.HasIndex(x => x.TenantId);
            e.HasIndex(x => x.LobbyAccessCode).IsUnique(); // GLOBAL uniqueness across tenants
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.TimeZone).HasMaxLength(64);
            e.Property(x => x.LobbyAccessCode).HasMaxLength(8).IsFixedLength();
        });

        // EventMembership
        b.Entity<EventMembership>(e =>
        {
            e.HasIndex(x => new { x.EventId, x.UserId }).IsUnique();
            e.HasOne(x => x.Event).WithMany(ev => ev.Memberships).HasForeignKey(x => x.EventId);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        // EventMembershipRoom (composite key)
        b.Entity<EventMembershipRoom>(e =>
        {
            e.HasKey(x => new { x.EventMembershipId, x.RoomId });
            e.HasOne(x => x.EventMembership).WithMany(em => em.ScopedRooms).HasForeignKey(x => x.EventMembershipId);
            e.HasOne(x => x.Room).WithMany().HasForeignKey(x => x.RoomId);
        });

        // Invitation / InvitationRoom
        b.Entity<Invitation>(e =>
        {
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.Token).HasMaxLength(128);
        });
        b.Entity<InvitationRoom>(e =>
        {
            e.HasKey(x => new { x.InvitationId, x.RoomId });
            e.HasOne(x => x.Invitation).WithMany(i => i.ScopedRooms).HasForeignKey(x => x.InvitationId);
            e.HasOne(x => x.Room).WithMany().HasForeignKey(x => x.RoomId);
        });

        // Room
        b.Entity<Room>(e =>
        {
            e.HasIndex(x => x.EventId);
            e.HasIndex(x => x.AccessCode).IsUnique(); // GLOBAL uniqueness across tenants
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.AccessCode).HasMaxLength(8).IsFixedLength();
            e.HasOne(x => x.Event).WithMany(ev => ev.Rooms).HasForeignKey(x => x.EventId);
        });

        // ScheduleItem
        b.Entity<ScheduleItem>(e =>
        {
            e.HasIndex(x => new { x.RoomId, x.Position });
            e.Property(x => x.Title).HasMaxLength(300);
            e.Property(x => x.SpeakerName).HasMaxLength(200);
            e.HasOne(x => x.Room).WithMany(r => r.ScheduleItems).HasForeignKey(x => x.RoomId);
        });

        // ScheduleItemRun
        b.Entity<ScheduleItemRun>(e =>
        {
            e.HasIndex(x => new { x.ScheduleItemId, x.RunNumber }).IsUnique();
            e.HasOne(x => x.ScheduleItem).WithMany(s => s.Runs).HasForeignKey(x => x.ScheduleItemId);
        });

        // RoomTimerState
        b.Entity<RoomTimerState>(e =>
        {
            e.HasKey(x => x.RoomId);
            e.Property(x => x.Version).IsRowVersion();
            e.Property(x => x.CurrentMessage).HasMaxLength(500);
            e.HasOne(x => x.Room).WithOne(r => r.TimerState).HasForeignKey<RoomTimerState>(x => x.RoomId);
            e.HasOne(x => x.CurrentItem).WithMany().HasForeignKey(x => x.CurrentItemId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CurrentRun).WithMany().HasForeignKey(x => x.CurrentRunId).OnDelete(DeleteBehavior.Restrict);
        });

        // MessageTemplate
        b.Entity<MessageTemplate>(e =>
        {
            e.HasIndex(x => x.EventId);
            e.Property(x => x.Text).HasMaxLength(500);
        });

        // AuditLogEntry
        b.Entity<AuditLogEntry>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.AtUtc });
            e.Property(x => x.Action).HasMaxLength(64);
        });

        // AuthMagicLink
        b.Entity<AuthMagicLink>(e =>
        {
            e.HasKey(x => x.Token);
            e.Property(x => x.Token).HasMaxLength(128);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        // EmailOutbox
        b.Entity<EmailOutbox>(e =>
        {
            e.HasIndex(x => x.SentAt);
            e.Property(x => x.ToAddress).HasMaxLength(320);
            e.Property(x => x.Subject).HasMaxLength(500);
        });

        TenancyQueryFilters.Apply(b, () => _tenantContext.TenantId);
    }
}
