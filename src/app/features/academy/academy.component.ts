import { Component, EventEmitter, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AcademyService } from '../../core/services/academy.service';
import { TabManagerService } from '../../core/services/tab-manager.service';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { NotificationService } from '../../core/services/notification.service';
import { ChallengeValidation, Lesson, PracticeTask } from '../../core/models/academy.models';

@Component({
  selector: 'app-academy',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col lg:flex-row h-full bg-slate-950 text-slate-200 select-none overflow-hidden">
      <!-- Left Syllabus Sidebar -->
      <div class="w-full lg:w-80 max-h-60 lg:max-h-none border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-900/80 flex flex-col shrink-0">
        <!-- Progress Header -->
        <div class="p-4 border-b border-slate-800 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
              </svg>
              <span class="font-semibold text-slate-300">Academia SQL ({{ academyService.lessons().length }} módulos)</span>
            </div>
            <span class="font-bold text-purple-400 font-mono">{{ progressPercentage() }}%</span>
          </div>
          <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
              [style.width.%]="progressPercentage()">
            </div>
          </div>
          <input
            type="search"
            [(ngModel)]="topicFilter"
            placeholder="Filtrar categoría o tema..."
            class="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500" />
        </div>

        <!-- Lessons List -->
        <div class="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          @for (lesson of filteredLessons(); track lesson.id) {
            <div
              (click)="selectLesson(lesson)"
              [class.bg-purple-950/60]="activeLesson()?.id === lesson.id"
              [class.border-l-2]="activeLesson()?.id === lesson.id"
              [class.border-purple-500]="activeLesson()?.id === lesson.id"
              [class.text-white]="activeLesson()?.id === lesson.id"
              [class.text-slate-300]="activeLesson()?.id !== lesson.id"
              class="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors">
              <div class="flex items-center gap-2.5 min-w-0">
                <span
                  [class.bg-purple-600]="activeLesson()?.id === lesson.id"
                  [class.bg-slate-800]="activeLesson()?.id !== lesson.id"
                  class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-200 shrink-0">
                  {{ lesson.order }}
                </span>
                <div class="min-w-0">
                  <div class="truncate font-medium">{{ lesson.title }}</div>
                  <div class="text-[10px] text-slate-500 truncate">{{ lesson.category }}</div>
                </div>
              </div>

              @if (lesson.completed) {
                <span class="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">✓</span>
              } @else {
                <span class="w-2 h-2 rounded-full bg-slate-700 shrink-0"></span>
              }
            </div>
          }
        </div>
      </div>

      <!-- Right Lesson Content Viewer -->
      <div class="flex-1 overflow-y-auto p-5 lg:p-8 space-y-6 select-text">
        @if (activeLesson(); as lesson) {
          <!-- Lesson Header -->
          <div class="border-b border-slate-800 pb-5">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-purple-900/60 text-purple-300 border border-purple-500/30">
                {{ lesson.category }}
              </span>
              <span class="text-xs text-slate-500">Módulo {{ lesson.order }} de {{ academyService.lessons().length }} · {{ lesson.durationMinutes }} min</span>
            </div>
            <h1 class="text-xl lg:text-2xl font-bold text-white tracking-tight">{{ lesson.title }}</h1>
            <p class="text-sm text-slate-400 mt-1">{{ lesson.description }}</p>
          </div>

          <!-- Theory Section -->
          <div class="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed whitespace-pre-line">
            {{ lesson.theory }}
          </div>

          <!-- Code Snippet & Interactive Runner -->
          <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            <div class="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="font-mono text-purple-400 font-semibold flex items-center gap-2">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                Ejemplo SQL Ejecutable
              </span>

              <button
                (click)="loadInEditor(lesson.codeSnippet, lesson.title)"
                class="flex items-center gap-1.5 px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium transition-colors shadow-sm">
                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>Cargar en Editor y Ejecutar</span>
              </button>
            </div>

            <pre class="p-4 text-xs font-mono text-cyan-200 overflow-x-auto bg-slate-950/80 leading-relaxed">{{ lesson.codeSnippet }}</pre>
          </div>

          <!-- Practice Tasks with Isolated Sandbox Validation -->
          @if (lesson.tasks.length > 0) {
            <div class="bg-slate-900/60 rounded-xl border border-slate-800 p-5 space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold text-white flex items-center gap-2">
                  <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                  Ejercicio Práctico Interactivo
                </h3>
                <span class="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono">
                  Sandbox PGlite aislado
                </span>
              </div>

              @for (task of lesson.tasks; track $index) {
                <div class="space-y-3 text-xs">
                  <p class="text-slate-200 font-medium">{{ task.instruction }}</p>

                  @if (task.expectedResult) {
                    <div class="text-[11px] text-slate-400">
                      <span class="font-semibold text-slate-300">Resultado esperado:</span> {{ task.expectedResult }}
                    </div>
                  }

                  <textarea
                    [(ngModel)]="practiceSql"
                    rows="4"
                    placeholder="-- Escribe aquí tu consulta SQL para probarla contra PostgreSQL..."
                    class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-cyan-200 focus:outline-none focus:border-purple-500 resize-y"></textarea>

                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-3">
                      <button
                        (click)="toggleHint($index)"
                        class="text-amber-400 hover:text-amber-300 underline text-xs">
                        {{ showingHint() === $index ? 'Ocultar Pista' : 'Ver Pista' }}
                      </button>

                      <button
                        (click)="fillTaskSolution(task.solutionSql)"
                        class="text-cyan-400 hover:text-cyan-300 underline text-xs">
                        Copiar Solución aquí
                      </button>

                      <button
                        (click)="loadInEditor(task.solutionSql, 'ejercicio_' + lesson.order + '.sql')"
                        class="text-purple-400 hover:text-purple-300 underline text-xs">
                        Abrir en Editor principal
                      </button>
                    </div>

                    <button
                      (click)="runTaskValidation(lesson, task)"
                      [disabled]="validatingTask()"
                      class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold transition-colors">
                      {{ validatingTask() ? 'Validando...' : 'Validar Ejercicio' }}
                    </button>
                  </div>

                  @if (showingHint() === $index) {
                    <div class="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 font-mono text-xs">
                      💡 {{ task.hint }}
                    </div>
                  }

                  @if (taskResult(); as res) {
                    <div
                      [class.bg-emerald-950/40]="res.passed"
                      [class.border-emerald-500/40]="res.passed"
                      [class.bg-rose-950/40]="!res.passed"
                      [class.border-rose-500/40]="!res.passed"
                      class="p-3 rounded-xl border space-y-2">
                      <div class="font-semibold" [class.text-emerald-300]="res.passed" [class.text-rose-300]="!res.passed">
                        {{ res.passed ? '✓ ¡Correcto! Lección completada' : '✕ Aún no coincide' }}
                      </div>
                      <p [class.text-emerald-200]="res.passed" [class.text-rose-200]="!res.passed">{{ res.message }}</p>

                      @if (res.userColumns.length > 0 && res.userRows.length > 0) {
                        <div class="overflow-x-auto max-h-40 rounded border border-slate-800 bg-slate-950">
                          <table class="w-full text-left font-mono text-[11px]">
                            <thead class="bg-slate-900 text-slate-400 border-b border-slate-800">
                              <tr>
                                @for (c of res.userColumns; track c) {
                                  <th class="px-2 py-1">{{ c }}</th>
                                }
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800/60 text-slate-300">
                              @for (r of res.userRows.slice(0, 5); track $index) {
                                <tr>
                                  @for (c of res.userColumns; track c) {
                                    <td class="px-2 py-1">{{ r[c] === null || r[c] === undefined ? 'NULL' : r[c] }}</td>
                                  }
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- Completion Toggle & Next Navigation -->
          <div class="pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
            <button
              (click)="academyService.toggleLessonComplete(lesson.id)"
              [class.bg-emerald-600]="lesson.completed"
              [class.hover:bg-emerald-500]="lesson.completed"
              [class.bg-slate-800]="!lesson.completed"
              [class.hover:bg-slate-700]="!lesson.completed"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-md">
              <span>{{ lesson.completed ? '✓ Lección Completada' : 'Marcar como Completada' }}</span>
            </button>

            @if (nextLesson(); as next) {
              <button
                (click)="selectLesson(next)"
                class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-300 transition-colors">
                Siguiente: {{ next.order }}. {{ next.category }} →
              </button>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class AcademyComponent {
  @Output() navigateToEditor = new EventEmitter<void>();

  activeLesson = signal<Lesson | null>(null);
  showingHint = signal<number | null>(null);
  validatingTask = signal<boolean>(false);
  taskResult = signal<ChallengeValidation | null>(null);
  practiceSql = '';
  topicFilter = '';

  constructor(
    public academyService: AcademyService,
    private tabManager: TabManagerService,
    private sqlEngine: SqlEngineService,
    private notifications: NotificationService
  ) {
    const list = this.academyService.lessons();
    if (list.length > 0) {
      this.selectLesson(list[0]);
    }
  }

  filteredLessons = computed(() => {
    const term = this.topicFilter.trim().toLowerCase();
    const list = this.academyService.lessons();
    if (!term) return list;
    return list.filter(
      l =>
        l.title.toLowerCase().includes(term) ||
        l.category.toLowerCase().includes(term) ||
        l.description.toLowerCase().includes(term)
    );
  });

  nextLesson = computed(() => {
    const cur = this.activeLesson();
    if (!cur) return null;
    const list = this.academyService.lessons();
    const idx = list.findIndex(l => l.id === cur.id);
    return idx >= 0 && idx + 1 < list.length ? list[idx + 1] : null;
  });

  progressPercentage = computed(() => {
    const lessons = this.academyService.lessons();
    if (lessons.length === 0) return 0;
    const completed = lessons.filter(l => l.completed).length;
    return Math.round((completed / lessons.length) * 100);
  });

  selectLesson(lesson: Lesson): void {
    this.activeLesson.set(lesson);
    this.showingHint.set(null);
    this.taskResult.set(null);
    this.practiceSql = '';
  }

  toggleHint(idx: number): void {
    this.showingHint.set(this.showingHint() === idx ? null : idx);
  }

  fillTaskSolution(sql: string): void {
    this.practiceSql = sql;
  }

  async runTaskValidation(lesson: Lesson, task: PracticeTask): Promise<void> {
    this.validatingTask.set(true);
    try {
      const res = await this.academyService.validateLessonTask(lesson, task, this.practiceSql);
      this.taskResult.set(res);
      if (res.passed) {
        this.notifications.success('¡Ejercicio superado!', `Lección "${lesson.category}" completada.`);
      } else {
        this.notifications.warning('Revisa tu consulta', res.message);
      }
    } finally {
      this.validatingTask.set(false);
    }
  }

  async loadInEditor(sql: string, title?: string): Promise<void> {
    this.tabManager.loadSnippet(sql, title);
    this.navigateToEditor.emit();
    try {
      await this.sqlEngine.executeQuery(sql);
      this.notifications.success('Código cargado', 'Consulta ejecutada en el Editor SQL.');
    } catch {
      // handled cleanly by engine
    }
  }
}
