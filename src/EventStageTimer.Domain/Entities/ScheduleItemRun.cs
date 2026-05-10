namespace EventStageTimer.Domain.Entities;

public enum RunTrigger { Operator = 1, Scheduler = 2, Skip = 3 }
public enum RunEndedReason { Stop = 1, Reset = 2, SkipReplaced = 3 }

public class ScheduleItemRun
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ScheduleItemId { get; set; }
    public ScheduleItem ScheduleItem { get; set; } = null!;
    public int RunNumber { get; set; }
    public RunTrigger Trigger { get; set; }
    public DateTime StartedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public RunEndedReason? EndedReason { get; set; }
}
