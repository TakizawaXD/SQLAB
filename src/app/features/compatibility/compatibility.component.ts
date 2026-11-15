import { Component, EventEmitter, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { analyzeSqlDialect } from '../../core/utils/sql-utils';

@Component({
  selector: 'app-compatibility',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full bg-slate-950 text-slate-200 overflow-y-auto p-6 lg:p-8 space-y-8">
      <!-- Header -->
      <div class="border-b border-slate-800 pb-5 select-none">
        <div class="flex items-center gap-2 mb-2">
          <span class="px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-purple-900/60 text-purple-300 border border-purple-500/30">
            Referencia Técnica y Verificador
          </span>
          <span class="text-xs text-slate-400">PostgreSQL 16 (PGlite Wasm)</span>
        </div>
        <h1 class="text-xl lg:text-2xl font-bold text-white tracking-tight">Compatibilidad SQL y Detector de Dialectos</h1>
        <p class="text-sm text-slate-400 mt-1 max-w-3xl">
          SQL LAB utiliza PostgreSQL como dialecto principal. No asumas que comandos de MySQL, SQL Server, Oracle o SQLite son idénticos: usa el verificador inferior o consulta las diferencias y limitaciones documentadas del entorno embebido.
        </p>
      </div>

      <!-- Interactive Dialect Analyzer -->
      <div class="p-5 rounded-2xl bg-slate-900/80 border border-purple-500/30 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold text-white">Analizador de Compatibilidad entre Dialectos → PostgreSQL</h2>
            <p class="text-xs text-slate-400">Pega cualquier sentencia (MySQL, SQL Server, Oracle o SQLite) para detectar construcciones no nativas.</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              (click)="loadExample('mysql')"
              class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-cyan-300">
              Ejemplo MySQL
            </button>
            <button
              (click)="loadExample('sqlserver')"
              class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-blue-300">
              Ejemplo SQL Server
            </button>
            <button
              (click)="loadExample('oracle')"
              class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-amber-300">
              Ejemplo Oracle
            </button>
          </div>
        </div>

        <textarea
          [ngModel]="sampleInput()"
          (ngModelChange)="sampleInput.set($event)"
          rows="4"
          spellcheck="false"
          placeholder="Pega aquí tu consulta SQL (ej. CREATE TABLE demo (id INT(11) AUTO_INCREMENT PRIMARY KEY, fecha DATETIME);)..."
          class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-cyan-200 focus:outline-none focus:border-purple-500"></textarea>

        @if (sampleInput().trim()) {
          @if (detectedWarnings().length > 0) {
            <div class="space-y-2">
              @for (w of detectedWarnings(); track w.dialect + ':' + w.construct) {
                <div class="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span class="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-200 font-bold text-[10px] mr-2">{{ w.dialect }}</span>
                    <strong class="text-amber-300 font-mono">{{ w.construct }}</strong>
                    <span class="text-slate-300 ml-2">— {{ w.message }}</span>
                  </div>
                  <div class="text-emerald-300 font-mono text-[11px] shrink-0">→ {{ w.suggestion }}</div>
                </div>
              }
            </div>
          } @else {
            <div class="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between gap-2">
              <span>✓ No se detectaron incompatibilidades obvias de otros dialectos. Puedes probarlo directamente en el motor PostgreSQL.</span>
              <button
                (click)="tryInEditor.emit(sampleInput())"
                class="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-[11px] shrink-0">
                Ejecutar en Editor →
              </button>
            </div>
          }
        }
      </div>

      <!-- Engine Capabilities Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-xs select-none">
        <!-- DDL -->
        <div class="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div class="flex items-center gap-2 font-bold text-purple-400">
            <span class="p-1 rounded bg-purple-950 border border-purple-500/30">DDL</span>
            <span>Definición</span>
          </div>
          <ul class="space-y-1 font-mono text-[11px] text-slate-300">
            <li><span class="text-emerald-400">✓</span> CREATE TABLE / SCHEMA</li>
            <li><span class="text-emerald-400">✓</span> ALTER TABLE (ADD/DROP/RENAME)</li>
            <li><span class="text-emerald-400">✓</span> DROP / TRUNCATE</li>
            <li><span class="text-emerald-400">✓</span> INDEX / SEQUENCE / VIEW</li>
          </ul>
        </div>

        <!-- DML -->
        <div class="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div class="flex items-center gap-2 font-bold text-cyan-400">
            <span class="p-1 rounded bg-cyan-950 border border-cyan-500/30">DML</span>
            <span>Manipulación</span>
          </div>
          <ul class="space-y-1 font-mono text-[11px] text-slate-300">
            <li><span class="text-emerald-400">✓</span> INSERT / ON CONFLICT</li>
            <li><span class="text-emerald-400">✓</span> UPDATE / DELETE</li>
            <li><span class="text-emerald-400">✓</span> Cláusula RETURNING</li>
            <li><span class="text-emerald-400">✓</span> JSON / JSONB / Arrays</li>
          </ul>
        </div>

        <!-- DQL -->
        <div class="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div class="flex items-center gap-2 font-bold text-emerald-400">
            <span class="p-1 rounded bg-emerald-950 border border-emerald-500/30">DQL</span>
            <span>Consultas</span>
          </div>
          <ul class="space-y-1 font-mono text-[11px] text-slate-300">
            <li><span class="text-emerald-400">✓</span> INNER/LEFT/RIGHT/FULL/CROSS JOIN</li>
            <li><span class="text-emerald-400">✓</span> GROUP BY, HAVING, DISTINCT</li>
            <li><span class="text-emerald-400">✓</span> UNION, INTERSECT, EXCEPT</li>
            <li><span class="text-emerald-400">✓</span> CTEs (WITH) y Window Funcs</li>
          </ul>
        </div>

        <!-- TCL -->
        <div class="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
          <div class="flex items-center gap-2 font-bold text-amber-400">
            <span class="p-1 rounded bg-amber-950 border border-amber-500/30">TCL</span>
            <span>Transacciones</span>
          </div>
          <ul class="space-y-1 font-mono text-[11px] text-slate-300">
            <li><span class="text-emerald-400">✓</span> BEGIN / COMMIT</li>
            <li><span class="text-emerald-400">✓</span> ROLLBACK</li>
            <li><span class="text-emerald-400">✓</span> SAVEPOINT / RELEASE</li>
            <li><span class="text-emerald-400">✓</span> PL/pgSQL Functions & Triggers</li>
          </ul>
        </div>

        <!-- DCL -->
        <div class="p-4 rounded-xl bg-slate-900/70 border border-amber-500/30 space-y-2">
          <div class="flex items-center gap-2 font-bold text-rose-400">
            <span class="p-1 rounded bg-rose-950 border border-rose-500/30">DCL</span>
            <span>Permisos Embebidos</span>
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            PGlite corre como proceso único local en Wasm (monousuario): <code class="text-amber-300">CREATE ROLE</code>, <code class="text-amber-300">GRANT</code> y <code class="text-amber-300">REVOKE</code> son sintácticamente aceptados en catálogo, pero sin autenticación TCP multiusuario remota.
          </p>
        </div>
      </div>

      <!-- Comparative Dialect Matrix Table -->
      <div class="space-y-4 select-none">
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          Matriz Comparativa de Sintaxis entre Motores SQL
        </h2>

        <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl">
          <table class="w-full text-left text-xs font-mono">
            <thead class="bg-slate-950 border-b border-slate-800 text-slate-300">
              <tr>
                <th class="p-3 w-48 font-semibold">Característica</th>
                <th class="p-3 text-purple-400 font-bold bg-purple-950/20 border-x border-purple-500/20">PostgreSQL (SQL LAB)</th>
                <th class="p-3 text-cyan-400 font-semibold">MySQL / MariaDB</th>
                <th class="p-3 text-blue-400 font-semibold">SQL Server</th>
                <th class="p-3 text-amber-400 font-semibold">Oracle</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/80">
              <tr class="hover:bg-slate-800/30">
                <td class="p-3 font-semibold text-slate-300">Autoincremental</td>
                <td class="p-3 text-purple-300 font-bold bg-purple-950/10 border-x border-purple-500/20">SERIAL / GENERATED ALWAYS AS IDENTITY</td>
                <td class="p-3 text-slate-300">AUTO_INCREMENT</td>
                <td class="p-3 text-slate-300">IDENTITY(1,1)</td>
                <td class="p-3 text-slate-300">GENERATED AS IDENTITY</td>
              </tr>
              <tr class="hover:bg-slate-800/30">
                <td class="p-3 font-semibold text-slate-300">Límite y Paginación</td>
                <td class="p-3 text-purple-300 font-bold bg-purple-950/10 border-x border-purple-500/20">LIMIT 10 OFFSET 20</td>
                <td class="p-3 text-slate-300">LIMIT 20, 10</td>
                <td class="p-3 text-slate-300">SELECT TOP 10 / FETCH NEXT</td>
                <td class="p-3 text-slate-300">FETCH FIRST 10 ROWS ONLY</td>
              </tr>
              <tr class="hover:bg-slate-800/30">
                <td class="p-3 font-semibold text-slate-300">Valores Nulos</td>
                <td class="p-3 text-purple-300 font-bold bg-purple-950/10 border-x border-purple-500/20">COALESCE(a, b)</td>
                <td class="p-3 text-slate-300">IFNULL(a, b) / COALESCE</td>
                <td class="p-3 text-slate-300">ISNULL(a, b)</td>
                <td class="p-3 text-slate-300">NVL(a, b)</td>
              </tr>
              <tr class="hover:bg-slate-800/30">
                <td class="p-3 font-semibold text-slate-300">Fecha/Hora actual</td>
                <td class="p-3 text-purple-300 font-bold bg-purple-950/10 border-x border-purple-500/20">NOW() / CURRENT_TIMESTAMP</td>
                <td class="p-3 text-slate-300">NOW()</td>
                <td class="p-3 text-slate-300">GETDATE()</td>
                <td class="p-3 text-slate-300">SYSDATE FROM DUAL</td>
              </tr>
              <tr class="hover:bg-slate-800/30">
                <td class="p-3 font-semibold text-slate-300">Identificadores</td>
                <td class="p-3 text-purple-300 font-bold bg-purple-950/10 border-x border-purple-500/20">"nombre_columna"</td>
                <td class="p-3 text-slate-300">&#96;nombre_columna&#96;</td>
                <td class="p-3 text-slate-300">[nombre_columna]</td>
                <td class="p-3 text-slate-300">"NOMBRE_COLUMNA"</td>
              </tr>
              <tr class="hover:bg-slate-800/30">
                <td class="p-3 font-semibold text-slate-300">Condicional</td>
                <td class="p-3 text-purple-300 font-bold bg-purple-950/10 border-x border-purple-500/20">CASE WHEN ... THEN ... END</td>
                <td class="p-3 text-slate-300">IF() / CASE WHEN</td>
                <td class="p-3 text-slate-300">IIF() / CASE WHEN</td>
                <td class="p-3 text-slate-300">DECODE / CASE WHEN</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class CompatibilityComponent {
  @Output() tryInEditor = new EventEmitter<string>();

  sampleInput = signal<string>('');
  detectedWarnings = computed(() => analyzeSqlDialect(this.sampleInput()));

  loadExample(dialect: 'mysql' | 'sqlserver' | 'oracle'): void {
    if (dialect === 'mysql') {
      this.sampleInput.set(
        "CREATE TABLE `usuarios` (\n  id INT(11) AUTO_INCREMENT PRIMARY KEY,\n  creado DATETIME\n) ENGINE=InnoDB;\nSELECT * FROM `usuarios` LIMIT 0, 10;"
      );
    } else if (dialect === 'sqlserver') {
      this.sampleInput.set(
        "SELECT TOP 5 nombre, IIF(stock > 0, 'Disponible', 'Agotado') AS estado, GETDATE() AS fecha\nFROM productos;"
      );
    } else {
      this.sampleInput.set(
        "SELECT NVL(nombre, 'Anónimo') AS cliente, SYSDATE AS hoy FROM DUAL;"
      );
    }
  }
}
