namespace EventStageTimer.Domain.Timer;

public enum TimerCommandError
{
    InvalidPhase = 1,
    StaleVersion = 2,
    AdjustmentOutOfBounds = 3,
    NoActiveItem = 4,
    NoNextItem = 5,
}
