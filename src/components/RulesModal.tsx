import type { ConfigDto } from '../api/types';
import { formatMoney } from '../game/money';
import { Modal } from './Modal';

export function RulesModal({ config, currency, onClose }: { config: ConfigDto | null; currency: string; onClose: () => void }) {
  const min = config ? formatMoney(config.minBet, currency) : '—';
  const max = config ? formatMoney(config.maxBet, currency) : '—';
  const maxWin = config ? formatMoney(config.maxWin, currency) : '—';
  return (
    <Modal title="How to play" onClose={onClose}>
      <section className="rules">
        <ol>
          <li>
            <strong>Join the herd.</strong> Place your bet while the raptors gather. You can run two raptors at once (two bets),
            and each one burrows on its own.
          </li>
          <li>
            <strong>Run!</strong> At the off the herd sprints across the plain and the multiplier climbs with every metre. The
            longer you run, the lower the comet falls and the more you stand to win.
          </li>
          <li>
            <strong>Burrow.</strong> Cash out at any time during the run: your raptor digs in and is safe underground. You win
            your stake × the multiplier at that moment. Set <em>Auto burrow</em> to dig in for you at a target.
          </li>
          <li>
            <strong>Impact.</strong> At some point the comet hits and the shockwave sweeps the plain. Any raptor still running
            is lost, and so is its bet.
          </li>
        </ol>
        <h3>Limits</h3>
        <p>
          Bets {min} to {max}. Max win per bet {maxWin}; a bigger multiplier still pays the max win. You can cancel a bet before
          the run starts.
        </p>
        <h3>Return to player: 96%</h3>
        <p>
          The multiplier is e<sup>0.12·t</sup>: 2× at about 5.8 s, 10× at 19 s and 100× at 38 s. The game server's provably fair
          generator draws the impact point before betting opens, with a 4% house edge, so the chance that a run reaches
          any multiplier <em>m</em> is 0.96 ÷ <em>m</em>. Whatever you aim for, early or late, by hand or with auto burrow,
          the return over time is 96% of what is staked. Nothing on screen changes the odds: the comet, the threat level,
          the jumps and the markers all just follow the clock.
        </p>
        <h3>Provably fair</h3>
        <p>
          Before every run you see the SHA-256 hash of the server seed and the run's nonce. The seed itself is revealed when it
          rotates, so you can check past results against it. See <em>Fairness</em> in the menu.
        </p>
        <h3>Connection</h3>
        <p>
          When you burrow, the server's clock times it, never yours. If you lose connection during a run, an auto burrow still
          fires on the server. A bet without one keeps running until the impact.
        </p>
      </section>
    </Modal>
  );
}
