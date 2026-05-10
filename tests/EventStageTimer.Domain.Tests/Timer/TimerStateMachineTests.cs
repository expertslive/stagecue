using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Xunit;

namespace EventStageTimer.Domain.Tests.Timer;

public class TimerStateMachineTests
{
    private static readonly DateTime Now = new(2026, 5, 10, 14, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void StartItem_with_no_preroll_goes_directly_to_Running()
    {
        var state = NewIdleState();
        var item = NewItem(durationSec: 1800, preRollSec: 0);

        var result = TimerStateMachine.StartItem(state, item, Now);

        result.IsSuccess.Should().BeTrue();
        state.Phase.Should().Be(TimerPhase.Running);
        state.StartedAtUtc.Should().Be(Now);
        state.PreRollEndsAtUtc.Should().BeNull();
        state.CurrentItemId.Should().Be(item.Id);
    }

    [Fact]
    public void StartItem_with_preroll_goes_to_PreRoll_with_correct_end_time()
    {
        var state = NewIdleState();
        var item = NewItem(durationSec: 1800, preRollSec: 30);

        TimerStateMachine.StartItem(state, item, Now);

        state.Phase.Should().Be(TimerPhase.PreRoll);
        state.PreRollEndsAtUtc.Should().Be(Now.AddSeconds(30));
        state.StartedAtUtc.Should().BeNull();
    }

    [Fact]
    public void StartItem_rejects_when_not_idle()
    {
        var state = NewIdleState();
        state.Phase = TimerPhase.Running;

        var result = TimerStateMachine.StartItem(state, NewItem(), Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(TimerCommandError.InvalidPhase);
    }

    [Fact]
    public void ExpirePreRoll_sets_StartedAtUtc_to_PreRollEndsAtUtc_not_now()
    {
        var state = NewIdleState();
        state.Phase = TimerPhase.PreRoll;
        state.CurrentItemId = Guid.NewGuid();
        state.PreRollEndsAtUtc = Now;

        // Tick fires 800ms late.
        TimerStateMachine.ExpirePreRoll(state, Now.AddMilliseconds(800));

        state.Phase.Should().Be(TimerPhase.Running);
        state.StartedAtUtc.Should().Be(Now); // NOT Now+800ms
        state.PreRollEndsAtUtc.Should().BeNull();
    }

    [Fact]
    public void Pause_then_Resume_accumulates_paused_seconds()
    {
        var state = RunningState(startedAt: Now);

        TimerStateMachine.Pause(state, Now.AddSeconds(60));
        TimerStateMachine.Resume(state, Now.AddSeconds(75));

        state.Phase.Should().Be(TimerPhase.Running);
        state.PausedAccumSec.Should().Be(15);
        state.PauseStartedAtUtc.Should().BeNull();
    }

    [Fact]
    public void AdjustTime_within_bounds_succeeds()
    {
        var state = RunningState(startedAt: Now);
        var r = TimerStateMachine.AdjustTime(state, deltaSec: 30);
        r.IsSuccess.Should().BeTrue();
        state.AdjustmentSec.Should().Be(30);
    }

    [Fact]
    public void AdjustTime_beyond_24h_is_rejected()
    {
        var state = RunningState(startedAt: Now);
        var r = TimerStateMachine.AdjustTime(state, deltaSec: 25 * 3600);
        r.IsFailure.Should().BeTrue();
        r.Error.Should().Be(TimerCommandError.AdjustmentOutOfBounds);
    }

    [Fact]
    public void Reset_clears_timer_fields_and_message_but_preserves_CurrentItemId()
    {
        var state = RunningState(startedAt: Now);
        state.CurrentMessage = "Wrap up";
        state.AdjustmentSec = 30;

        TimerStateMachine.Reset(state);

        state.Phase.Should().Be(TimerPhase.Idle);
        state.StartedAtUtc.Should().BeNull();
        state.AdjustmentSec.Should().Be(0);
        state.CurrentMessage.Should().BeNull();
        state.CurrentItemId.Should().NotBeNull(); // preserved
    }

    private static RoomTimerState NewIdleState() => new()
    {
        RoomId = Guid.NewGuid(),
        Phase = TimerPhase.Idle,
    };

    private static RoomTimerState RunningState(DateTime startedAt) => new()
    {
        RoomId = Guid.NewGuid(),
        Phase = TimerPhase.Running,
        CurrentItemId = Guid.NewGuid(),
        StartedAtUtc = startedAt,
    };

    private static ScheduleItem NewItem(int durationSec = 1800, int preRollSec = 30) => new()
    {
        Id = Guid.NewGuid(),
        Title = "Test",
        DurationSec = durationSec,
        PreRollSec = preRollSec,
    };
}
