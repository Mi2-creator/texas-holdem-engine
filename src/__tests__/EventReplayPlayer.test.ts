// ============================================================================
// EventReplayPlayer 单元测试
// ============================================================================

import { EventReplayPlayer } from '../replay/EventReplayPlayer';
import { demoEvents, demoEventsWithShowdown } from '../replay/demoEvents';

describe('EventReplayPlayer', () => {
  describe('初始化', () => {
    it('空事件序列应返回 empty viewModel', () => {
      const player = new EventReplayPlayer([]);
      const vm = player.toViewModel();

      expect(vm.count).toBe(0);
      expect(vm.index).toBe(0);
      expect(vm.playing).toBe(false);
      expect(vm.canNext).toBe(false);
      expect(vm.canPrev).toBe(false);
    });

    it('初始化时应在第一个事件', () => {
      const player = new EventReplayPlayer(demoEvents);
      const vm = player.toViewModel();

      expect(vm.index).toBe(0);
      expect(vm.count).toBe(demoEvents.length);
      expect(vm.canNext).toBe(true);
      expect(vm.canPrev).toBe(false);
      expect(vm.isAtStart).toBe(true);
      expect(vm.isAtEnd).toBe(false);
    });
  });

  describe('stepForward / stepBackward', () => {
    it('stepForward 应前进一步', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.stepForward();
      const vm = player.toViewModel();

      expect(vm.index).toBe(1);
      expect(vm.canPrev).toBe(true);
    });

    it('stepBackward 应后退一步', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.stepForward();
      player.stepForward();
      player.stepBackward();
      const vm = player.toViewModel();

      expect(vm.index).toBe(1);
    });

    it('在起始位置 stepBackward 不应改变 index', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.stepBackward();
      const vm = player.toViewModel();

      expect(vm.index).toBe(0);
      expect(vm.isAtStart).toBe(true);
    });

    it('在结束位置 stepForward 应停止播放', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.play();

      // 前进到最后
      for (let i = 0; i < demoEvents.length; i++) {
        player.stepForward();
      }

      const vm = player.toViewModel();
      expect(vm.isAtEnd).toBe(true);
      expect(vm.playing).toBe(false);
    });
  });

  describe('seek', () => {
    it('seek 应跳转到指定位置', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.seek(5);
      const vm = player.toViewModel();

      expect(vm.index).toBe(5);
    });

    it('seek 超出范围不应改变 index', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.seek(100);
      const vm = player.toViewModel();

      expect(vm.index).toBe(0);  // 初始位置不变
    });

    it('seek 负数不应改变 index', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.stepForward();
      player.seek(-1);
      const vm = player.toViewModel();

      expect(vm.index).toBe(1);  // 保持在 step forward 后的位置
    });
  });

  describe('seekToStart / seekToEnd', () => {
    it('seekToStart 应跳转到开始', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.seek(10);
      player.seekToStart();
      const vm = player.toViewModel();

      expect(vm.index).toBe(0);
      expect(vm.isAtStart).toBe(true);
    });

    it('seekToEnd 应跳转到结束并停止播放', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.play();
      player.seekToEnd();
      const vm = player.toViewModel();

      expect(vm.index).toBe(demoEvents.length - 1);
      expect(vm.isAtEnd).toBe(true);
      expect(vm.playing).toBe(false);
    });
  });

  describe('play / pause', () => {
    it('play 应设置 playing 为 true', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.play();
      const vm = player.toViewModel();

      expect(vm.playing).toBe(true);
    });

    it('pause 应设置 playing 为 false', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.play();
      player.pause();
      const vm = player.toViewModel();

      expect(vm.playing).toBe(false);
    });

    it('togglePlayPause 应切换 playing 状态', () => {
      const player = new EventReplayPlayer(demoEvents);

      player.togglePlayPause();
      expect(player.toViewModel().playing).toBe(true);

      player.togglePlayPause();
      expect(player.toViewModel().playing).toBe(false);
    });
  });

  describe('seekToPhase', () => {
    it('seekToPhase 应跳转到指定阶段的第一个事件', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.seekToPhase('Flop');
      const vm = player.toViewModel();

      expect(vm.phase).toBe('Flop');
    });

    it('seekToPhase Turn', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.seekToPhase('Turn');
      const vm = player.toViewModel();

      expect(vm.phase).toBe('Turn');
    });

    it('seekToPhase River', () => {
      const player = new EventReplayPlayer(demoEvents);
      player.seekToPhase('River');
      const vm = player.toViewModel();

      expect(vm.phase).toBe('River');
    });
  });

  describe('viewModel snapshot 一致性', () => {
    it('任意 index 的 snapshot 应正确反映该时刻状态', () => {
      const player = new EventReplayPlayer(demoEvents);

      // 测试几个关键点
      // index 0: HAND_START
      let vm = player.toViewModel();
      expect(vm.snapshot.handId).toBe('demo-001');
      expect(vm.snapshot.players.length).toBe(3);
      expect(vm.snapshot.phase).toBe('Preflop');

      // 跳到 Flop 阶段
      player.seekToPhase('Flop');
      vm = player.toViewModel();
      expect(vm.snapshot.communityCards.length).toBe(3);
      expect(vm.snapshot.phase).toBe('Flop');

      // 跳到 River 阶段
      player.seekToPhase('River');
      vm = player.toViewModel();
      expect(vm.snapshot.communityCards.length).toBe(5);
      expect(vm.snapshot.phase).toBe('River');
    });

    it('pot 计算应正确', () => {
      const player = new EventReplayPlayer(demoEvents);

      // 跳到最后一个事件（HAND_END）
      player.seekToEnd();
      const vm = player.toViewModel();

      // 根据 demoEvents 计算：
      // - blinds: 15
      // - preflop: alice 20, bob 15 more = 50
      // - flop: alice 30, bob 30 = 110
      // - turn: checks = 110
      // - river: alice 50, bob fold (pot doesn't include the final bet since bob folded)
      // Actually, when alice bets 50, it goes into pot, then bob folds
      // So final pot = 110 + 50 = 160
      expect(vm.snapshot.potTotal).toBe(160);
    });

    it('player chips 应正确更新', () => {
      const player = new EventReplayPlayer(demoEvents);

      // HAND_END 后 alice 应获得 160
      player.seekToEnd();
      const vm = player.toViewModel();

      const alice = vm.snapshot.players.find(p => p.id === 'alice');
      // Alice: 500 - 20(preflop) - 30(flop) - 50(river) + 160(win) = 560
      expect(alice?.chips).toBe(560);
    });
  });

  describe('demoEventsWithShowdown', () => {
    it('应正确处理 SHOWDOWN 事件', () => {
      const player = new EventReplayPlayer(demoEventsWithShowdown);

      // 找到 SHOWDOWN 事件的位置
      player.seekToPhase('Showdown');
      const vm = player.toViewModel();

      expect(vm.phase).toBe('Showdown');
      expect(vm.snapshot.isActive).toBe(false);
    });

    it('pot 计算应正确 (showdown scenario)', () => {
      const player = new EventReplayPlayer(demoEventsWithShowdown);
      player.seekToEnd();
      const vm = player.toViewModel();

      // pot = 20(preflop) + 40(flop) + 160(river) = 220
      expect(vm.snapshot.potTotal).toBe(220);
    });
  });
});
