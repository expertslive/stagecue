using EventStageTimer.Domain.Entities;
using Microsoft.AspNetCore.Authorization;

namespace EventStageTimer.Api.Auth.Policies;

public sealed class RoomAccessRequirement(EventRole minimumRole) : IAuthorizationRequirement
{
    public EventRole MinimumRole { get; } = minimumRole;
}
