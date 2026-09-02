// A floating side panel showing a task's saved Claude review verbatim — the same
// markdown text persisted to ~/.config/goo/reviews/ (backend/server.py's
// ClaudeManager._persist_review), fetched fresh on every open via
// ClaudePlugin.fetchReviewText rather than through the workspace's Claude tab.
// Opened from the Reviews screen's group-header button (see reviews.js's
// openReviewPanel) — reuses the same floating draggable/resizable chrome as
// CommitsDialog (core/dialogs.js), defaulting to the right edge of the screen.

import {
  Component,
  markup,
  onMounted,
  onWillUnmount,
  signal,
  useProps,
  usePlugin,
  xml,
  t,
} from "@odoo/owl";
import { ClaudePlugin } from "../workspaces_screen/claude_plugin.js";
import { WorkspacePlugin } from "../core/workspace_plugin.js";
import { RouterPlugin } from "../core/router_plugin.js";
import { useDragResize } from "../core/common.js";
import { mdToHtml, parseReviewScore, reviewScoreClass } from "../core/utils.js";

export class ReviewPanel extends Component {
  static template = xml`
    <div class="term-panel review-panel" t-ref="this.drag.handle">
      <div class="term-panel-head" t-on-mousedown="this.drag.onDragStart">
        <div class="review-panel-head-left">
          <span class="term-panel-title" t-out="this.props.label"/>
          <span t-if="this.score() !== null" class="rev-score" t-att-class="this.scoreClass()" t-out="this.score()"/>
        </div>
        <button class="event-log-x" title="close" t-on-click="() => this.done(null)">✕</button>
      </div>
      <div class="review-panel-body">
        <div t-if="this.loading()" class="commits-empty">loading…</div>
        <div t-elif="!this.text()" class="commits-empty">no review saved for this task yet</div>
        <div t-else="" class="review-panel-text md-content" t-out="this.html()"/>
      </div>
      <div class="review-panel-foot">
        <button class="pbtn primary" t-on-click="() => this.continueToChat()">Continue to chat with claude</button>
      </div>
      <div class="term-panel-resize" t-on-mousedown="this.drag.onResizeStart"/>
    </div>`;

  props = useProps({ done: t.function(), workspaceId: t.string(), label: t.string() });
  claude = usePlugin(ClaudePlugin);
  wt = usePlugin(WorkspacePlugin);
  router = usePlugin(RouterPlugin);
  text = signal("");
  loading = signal(true);

  setup() {
    this.drag = useDragResize({
      w: 640,
      h: 620,
      place: (w, h) => ({
        x: Math.max(0, window.innerWidth - w - 16),
        y: Math.max(0, Math.floor((window.innerHeight - h) / 2)),
      }),
    });
    onMounted(() => this.load());
    const onKey = (e) => {
      if (e.key === "Escape") this.done(null);
    };
    document.addEventListener("keydown", onKey);
    onWillUnmount(() => document.removeEventListener("keydown", onKey));
  }

  async load() {
    this.loading.set(true);
    try {
      this.text.set(await this.claude.fetchReviewText(this.props.workspaceId));
    } finally {
      this.loading.set(false);
    }
  }

  // rendered once per text change, not cached — reviews are short enough that
  // re-parsing on every render is a non-issue, and a signal-backed getter would
  // just be more code for the same effect.
  html() {
    return markup(mdToHtml(this.text()));
  }

  // Claude's own merge-readiness guess (0-100), parsed straight from the saved
  // review text — same "Score: N/100" convention as the group-header badge
  // (ClaudePlugin.reviewScore), just read off this panel's own fetched text
  // instead of the live conversation.
  score() {
    return parseReviewScore(this.text());
  }

  scoreClass() {
    return reviewScoreClass(this.score());
  }

  done(result) {
    this.props.done(result);
  }

  // jump to the workspace's own Claude tab for the full transcript (tool calls,
  // the original prompt, etc.) — this panel only ever shows the saved review
  // text itself. Closes the panel first since the dialog container stays
  // mounted across screen navigation and would otherwise keep floating there.
  continueToChat() {
    this.wt.selectOnOpen(this.props.workspaceId);
    this.wt.requestedPane.set("claude");
    this.router.go("workspaces");
    this.done(null);
  }
}
