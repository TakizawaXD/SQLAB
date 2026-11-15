import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademyService } from '../../core/services/academy.service';
import { NotificationService } from '../../core/services/notification.service';
import { Challenge, ChallengeDifficulty, ChallengeValidation } from '../../core/models/academy.models';

@Component({
  selector: 'app-challenges',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col lg:flex-row h-full bg-slate-950 text-slate-200 select-none overflow-hidden">
      <!-- Left Challenges List -->
      <div class="w-full lg:w-80 max-h-64 lg:max-h-none border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/80 flex flex-col shrink-0">
        <div class="p-4 border-b border-slate-800 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                <path d="M4 22h16"></path>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
              </svg>
              <h2 class="font-bold text-sm text-white">Desafíos SQL</h2>
            </div>

            <button
              (click)="showHistory.set(!showHistory())"
              [class.bg-purple-600]="showHistory()"
              [class.text-white]="showHistory()"
              class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-medium text-slate-300 transition-colors">
              {{ showHistory() ? 'Lista' : 'Historial (' + academyService.challengeHistory().length + ')' }}
            </button>
          </div>

          <!-- Score Card -->
          <div class="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
            <span class="text-slate-400">Puntuación:</span>
            <span class="font-mono font-bold text-amber-400">
              {{ academyService.totalScore() }} / {{ academyService.maxPossibleScore() }} pts
            </span>
          </div>

          @if (!showHistory()) {
            <div class="flex flex-wrap gap-1">
              @for (lvl of difficultyTabs; track lvl) {
                <button
                  (click)="difficultyFilter.set(lvl)"
                  [class.bg-purple-600]="difficultyFilter() === lvl"
                  [class.text-white]="difficultyFilter() === lvl"
                  [class.bg-slate-800]="difficultyFilter() !== lvl"
                  [class.text-slate-400]="difficultyFilter() !== lvl"
                  class="px-2 py-0.5 rounded text-[10px] font-medium transition-colors">
                  {{ lvl }}
                </button>
              }
            </div>
          }
        </div>

        @if (!showHistory()) {
          <div class="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
            @for (ch of filteredChallenges(); track ch.id) {
              <div
                (click)="selectChallenge(ch)"
                [class.bg-purple-950/60]="activeChallenge()?.id === ch.id"
                [class.border-l-2]="activeChallenge()?.id === ch.id"
                [class.border-purple-500]="activeChallenge()?.id === ch.id"
                class="p-3 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors space-y-1">
                <div class="flex items-center justify-between gap-1">
                  <div class="flex items-center gap-1.5">
                    <span
                      [class.text-emerald-400]="ch.difficulty === 'Principiante'"
                      [class.text-amber-400]="ch.difficulty === 'Intermedio'"
                      [class.text-rose-400]="ch.difficulty === 'Avanzado'"
                      class="text-[10px] font-semibold uppercase tracking-wider">
                      {{ ch.difficulty }}
                    </span>
                    <span class="text-[10px] font-mono text-slate-500">· {{ ch.points }} pts</span>
                  </div>
                  @if (ch.solved) {
                    <span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-medium">✓</span>
                  }
                </div>
                <div class="font-semibold text-slate-200 text-xs">{{ ch.title }}</div>
                <div class="flex items-center justify-between text-[10px] text-slate-400">
                  <span class="truncate">{{ ch.category }}</span>
                  <span class="font-mono uppercase text-cyan-400">{{ ch.validationType === 'ddl' ? 'DDL' : 'SQL' }}</span>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs">
            @for (att of academyService.challengeHistory(); track att.id) {
              <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-slate-200 truncate">{{ att.challengeTitle }}</span>
                  <span
                    [class.text-emerald-400]="att.passed"
                    [class.text-rose-400]="!att.passed"
                    class="font-mono text-[10px] shrink-0">
                    {{ att.passed ? (att.pointsAwarded > 0 ? '+' + att.pointsAwarded + ' pts' : 'OK') : 'Fallo' }}
                  </span>
                </div>
                <div class="font-mono text-[10px] text-cyan-300 truncate">{{ att.queryPreview }}</div>
                <div class="text-[10px] text-slate-500">{{ formatTimestamp(att.timestamp) }}</div>
              </div>
            } @empty {
              <div class="p-4 text-center text-slate-500">Aún no hay intentos registrados.</div>
            }
          </div>
        }
      </div>

      <!-- Right Interactive Solver Workspace -->
      <div class="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 select-text">
        @if (activeChallenge(); as ch) {
          <!-- Challenge Header -->
          <div class="border-b border-slate-800 pb-4">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span
                [class.bg-emerald-950]="ch.difficulty === 'Principiante'"
                [class.text-emerald-400]="ch.difficulty === 'Principiante'"
                [class.border-emerald-500/30]="ch.difficulty === 'Principiante'"
                [class.bg-amber-950]="ch.difficulty === 'Intermedio'"
                [class.text-amber-400]="ch.difficulty === 'Intermedio'"
                [class.border-amber-500/30]="ch.difficulty === 'Intermedio'"
                [class.bg-rose-950]="ch.difficulty === 'Avanzado'"
                [class.text-rose-400]="ch.difficulty === 'Avanzado'"
                [class.border-rose-500/30]="ch.difficulty === 'Avanzado'"
                class="px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border">
                {{ ch.difficulty }}
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {{ ch.points }} pts
              </span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                Sandbox aislado · Tu proyecto personal no se modifica
              </span>
            </div>
            <h1 class="text-xl font-bold text-white">{{ ch.title }}</h1>
            <p class="text-sm text-slate-300 mt-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">{{ ch.objective }}</p>
          </div>

          <!-- Query Editor Area -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-400">Tu consulta SQL (PostgreSQL):</span>
              <button
                (click)="resetQuery()"
                class="text-slate-400 hover:text-white underline">
                Restablecer plantilla
              </button>
            </div>
            <textarea
              [(ngModel)]="userSql"
              rows="7"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-200 focus:outline-none focus:border-purple-500 resize-y leading-relaxed"></textarea>
          </div>

          <!-- Action buttons & Hints -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              @for (hint of ch.hints; track $index) {
                <button
                  (click)="toggleHint($index)"
                  class="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 text-amber-300 text-xs hover:bg-amber-900/40 transition-colors">
                  💡 Pista {{ $index + 1 }}
                </button>
              }

              <button
                (click)="showSolution.set(!showSolution())"
                class="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 text-xs hover:text-white hover:bg-slate-800 transition-colors">
                {{ showSolution() ? 'Ocultar Solución' : 'Ver Solución Explicada' }}
              </button>
            </div>

            <button
              (click)="runValidation()"
              [disabled]="validating()"
              class="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white font-semibold text-xs transition-all shadow-lg shadow-purple-600/30 active:scale-95">
              @if (validating()) {
                <span>Evaluando en PGlite...</span>
              } @else {
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Validar en Sandbox</span>
              }
            </button>
          </div>

          <!-- Hints Display -->
          @if (activeHint() !== null) {
            <div class="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200 font-mono">
              💡 {{ ch.hints[activeHint()!] }}
            </div>
          }

          <!-- Explained Solution Drawer -->
          @if (showSolution()) {
            <div class="p-4 bg-slate-900 border border-slate-700 rounded-xl text-xs space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-cyan-300">Solución de referencia</span>
                <button
                  (click)="useSolution()"
                  class="px-2 py-0.5 rounded bg-cyan-600/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-600/30">
                  Cargar en editor
                </button>
              </div>
              <pre class="p-3 rounded-lg bg-slate-950 font-mono text-cyan-200 overflow-x-auto">{{ ch.solutionQuery }}</pre>
              <p class="text-slate-300 leading-relaxed">{{ ch.explanation }}</p>
            </div>
          }

          <!-- Validation Result Card -->
          @if (validationResult(); as res) {
            <div
              [class.bg-emerald-950/40]="res.passed"
              [class.border-emerald-500/40]="res.passed"
              [class.bg-rose-950/40]="!res.passed"
              [class.border-rose-500/40]="!res.passed"
              class="p-4 rounded-xl border text-xs space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="font-bold text-sm" [class.text-emerald-300]="res.passed" [class.text-rose-300]="!res.passed">
                  {{ res.passed ? '🎉 ¡Desafío superado con éxito!' : '❌ Solución incorrecta' }}
                </div>
                @if (res.pointsAwarded) {
                  <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                    +{{ res.pointsAwarded }} pts
                  </span>
                }
              </div>

              <p [class.text-emerald-200]="res.passed" [class.text-rose-200]="!res.passed">{{ res.message }}</p>

              @if (res.dialectHints?.length) {
                <div class="p-2 rounded bg-amber-950/50 border border-amber-500/30 text-amber-200 text-[11px]">
                  @for (h of res.dialectHints; track $index) {
                    <div>{{ h }}</div>
                  }
                </div>
              }

              @if (res.userColumns.length > 0 && res.userRows.length > 0) {
                <div class="space-y-1">
                  <div class="text-[11px] font-semibold text-slate-400">
                    {{ ch.validationType === 'ddl' ? 'Catálogo real creado en PostgreSQL:' : 'Tu resultado obtenido (' + res.userRows.length + ' filas):' }}
                  </div>
                  <div class="overflow-x-auto max-h-48 rounded-lg border border-slate-800 bg-slate-950">
                    <table class="w-full text-left font-mono text-[11px]">
                      <thead class="bg-slate-900 text-slate-400 border-b border-slate-800">
                        <tr>
                          @for (col of res.userColumns; track col) {
                            <th class="px-2.5 py-1.5">{{ col }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-800/60 text-slate-300">
                        @for (row of res.userRows.slice(0, 10); track $index) {
                          <tr>
                            @for (col of res.userColumns; track col) {
                              <td class="px-2.5 py-1">{{ row[col] === null || row[col] === undefined ? 'NULL' : row[col] }}</td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              }

              @if (res.passed) {
                <div class="pt-2 border-t border-emerald-500/30 text-slate-300">
                  <span class="font-semibold text-emerald-400">Explicación pedagógica:</span>
                  <p class="mt-1">{{ ch.explanation }}</p>
                </div>
              }
            </div>
          }
        }
      </div>
    </div>
  `
})
export class ChallengesComponent {
  readonly difficultyTabs: ('Todos' | ChallengeDifficulty)[] = ['Todos', 'Principiante', 'Intermedio', 'Avanzado'];

  activeChallenge = signal<Challenge | null>(null);
  difficultyFilter = signal<'Todos' | ChallengeDifficulty>('Todos');
  showHistory = signal<boolean>(false);
  showSolution = signal<boolean>(false);
  userSql = '';
  activeHint = signal<number | null>(null);
  validating = signal<boolean>(false);
  validationResult = signal<ChallengeValidation | null>(null);

  filteredChallenges = computed(() => {
    const lvl = this.difficultyFilter();
    const list = this.academyService.challenges();
    return lvl === 'Todos' ? list : list.filter(c => c.difficulty === lvl);
  });

  constructor(
    public academyService: AcademyService,
    private notifications: NotificationService
  ) {
    const list = this.academyService.challenges();
    if (list.length > 0) {
      this.selectChallenge(list[0]);
    }
  }

  selectChallenge(ch: Challenge): void {
    this.activeChallenge.set(ch);
    this.userSql = ch.starterQuery;
    this.activeHint.set(null);
    this.showSolution.set(false);
    this.validationResult.set(null);
  }

  resetQuery(): void {
    const ch = this.activeChallenge();
    if (ch) {
      this.userSql = ch.starterQuery;
    }
  }

  useSolution(): void {
    const ch = this.activeChallenge();
    if (ch) {
      this.userSql = ch.solutionQuery;
    }
  }

  toggleHint(idx: number): void {
    this.activeHint.set(this.activeHint() === idx ? null : idx);
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  async runValidation(): Promise<void> {
    const ch = this.activeChallenge();
    if (!ch) return;

    this.validating.set(true);
    try {
      const res = await this.academyService.validateChallenge(ch, this.userSql);
      this.validationResult.set(res);
      if (res.passed) {
        this.notifications.success('¡Desafío completado!', res.message);
      } else {
        this.notifications.warning('Solución no superada', res.message);
      }
    } finally {
      this.validating.set(false);
    }
  }
}
