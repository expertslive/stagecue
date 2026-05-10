namespace EventStageTimer.Domain.Entities;

public enum TimerPhase
{
    Idle = 0,
    PreRoll = 1,
    Running = 2,
    Paused = 3,
    Ended = 4,
}
