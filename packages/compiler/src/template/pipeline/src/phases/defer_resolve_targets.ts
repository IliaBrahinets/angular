/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as o from '../../../../output/output_ast';
import * as ir from '../../ir';
import type {ViewCompilationUnit, ComponentCompilationJob} from '../compilation';

export function phaseDeferResolveTargets(job: ComponentCompilationJob): void {
  const scopes = new Map<ir.XrefId, Scope>();

  function getScopeForView(view: ViewCompilationUnit): Scope {
    if (scopes.has(view.xref)) {
      return scopes.get(view.xref)!;
    }

    const scope = new Scope();
    for (const op of view.create) {
      // add everything that can be referenced.
      if (!ir.isElementOrContainerOp(op) || op.localRefs === null) {
        continue;
      }
      if (!Array.isArray(op.localRefs)) {
        throw new Error(
            'LocalRefs were already processed, but were needed to resolve defer targets.');
      }

      for (const ref of op.localRefs) {
        if (ref.target !== '') {
          continue;
        }
        scope.targets.set(ref.name, op.xref);
      }
    }

    scopes.set(view.xref, scope);
    return scope;
  }

  function resolveTrigger(
      deferOwnerView: ViewCompilationUnit, op: ir.DeferOnOp,
      placeholderView: ir.XrefId|null): void {
    switch (op.trigger.kind) {
      case ir.DeferTriggerKind.Idle:
        return;
      case ir.DeferTriggerKind.Interaction:
        if (op.trigger.targetName === null) {
          return;
        }
        let view: ViewCompilationUnit|null =
            placeholderView !== null ? job.views.get(placeholderView)! : deferOwnerView;
        let step = placeholderView !== null ? -1 : 0;

        while (view !== null) {
          const scope = getScopeForView(view);
          if (scope.targets.has(op.trigger.targetName)) {
            op.trigger.targetXref = scope.targets.get(op.trigger.targetName)!;
            op.trigger.targetView = view.xref;
            op.trigger.targetSlotViewSteps = step;
            return;
          }

          view = view.parent !== null ? job.views.get(view.parent)! : null;
          step++;
        }
        break;
      default:
        throw new Error(`Trigger kind ${(op.trigger as any).kind} not handled`);
    }
  }

  // Find the defer ops, and assign the data about their targets.
  for (const unit of job.units) {
    const defers = new Map<ir.XrefId, ir.DeferOp>();
    for (const op of unit.create) {
      switch (op.kind) {
        case ir.OpKind.Defer:
          defers.set(op.xref, op);
          break;
        case ir.OpKind.DeferOn:
          const deferOp = defers.get(op.defer)!;
          resolveTrigger(unit, op, deferOp.placeholderView);
          break;
      }
    }
  }
}



class Scope {
  targets = new Map<string, ir.XrefId>();
}
