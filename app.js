(function () {
  "use strict";

  var STORAGE_KEY = "microblog.posts.v1";
  var MAX_LENGTH = 280;
  var MAX_ENTRIES = 300;

  var els = {
    input: document.getElementById("composer-input"),
    submit: document.getElementById("submit"),
    counter: document.getElementById("counter"),
    counterValue: document.getElementById("counter-value"),
    timeline: document.getElementById("timeline"),
    emptyState: document.getElementById("empty-state"),
    feedCount: document.getElementById("feed-count"),
    statTotal: document.getElementById("stat-total"),
    statChars: document.getElementById("stat-chars"),
    statToday: document.getElementById("stat-today"),
    chart: document.getElementById("chart"),
    chartEmpty: document.getElementById("chart-empty"),
    toast: document.getElementById("toast"),
  };

  var state = {
    posts: [],
    storageAvailable: true,
    memoryFallback: [],
    composing: false,
    toastTimer: null,
    successTimer: null
  };

  /* ---------------------------------------------------------
     数据层
     --------------------------------------------------------- */
  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function sanitizePosts(raw) {
    if (!Array.isArray(raw)) return [];

    var seen = Object.create(null);
    var result = [];

    for (var i = 0; i < raw.length; i += 1) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;

      var content = typeof item.content === "string" ? item.content.trim() : "";
      if (!content) continue;

      var id = typeof item.id === "string" && item.id ? item.id : createId();
      if (seen[id]) id = createId();
      seen[id] = true;

      var createdAt = Number(item.createdAt);
      if (!isFinite(createdAt) || createdAt <= 0) createdAt = Date.now();

      result.push({
        id: id,
        content: content.slice(0, MAX_LENGTH),
        createdAt: createdAt
      });
    }

    result.sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });

    return result.slice(0, MAX_ENTRIES);
  }

  var store = {
    load: function () {
      if (!state.storageAvailable) {
        return sanitizePosts(state.memoryFallback);
      }
      try {
        var text = window.localStorage.getItem(STORAGE_KEY);
        if (!text) return [];
        return sanitizePosts(JSON.parse(text));
      } catch (error) {
        state.storageAvailable = false;
        console.warn("[微语] 本地数据读取失败，本次会话使用临时内存存储。", error);
        return [];
      }
    },

    save: function (posts) {
      if (!state.storageAvailable) {
        state.memoryFallback = posts;
        return false;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
        return true;
      } catch (error) {
        state.storageAvailable = false;
        state.memoryFallback = posts;
        console.warn("[微语] 本地存储不可用（可能为隐私模式或空间已满），本次会话使用临时内存存储。", error);
        return false;
      }
    }
  };

  /* ---------------------------------------------------------
     工具
     --------------------------------------------------------- */
  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatRelativeTime(timestamp) {
    var now = Date.now();
    var diff = now - timestamp;

    if (diff < 0) diff = 0;
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + " 分钟前";

    var date = new Date(timestamp);
    var today = new Date();
    var startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    if (timestamp >= startOfToday) {
      return "今天 " + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }
    if (timestamp >= startOfToday - 24 * 60 * 60 * 1000) {
      return "昨天 " + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }
    if (date.getFullYear() === today.getFullYear()) {
      return date.getMonth() + 1 + "月" + date.getDate() + "日 " + pad(date.getHours()) + ":" + pad(date.getMinutes());
    }
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日";
  }

  var WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function dateKey(date) {
    return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
  }

  function charLength(text) {
    if (typeof Array.from === "function") return Array.from(text).length;
    return text.length;
  }

  function formatMetric(value) {
    try {
      return value.toLocaleString("en-US");
    } catch (error) {
      return String(value);
    }
  }

  function computeStats(posts, now) {
    var base = new Date(now);
    var todayStart = startOfDay(base);
    var days = [];
    var bucket = Object.create(null);

    for (var i = 6; i >= 0; i -= 1) {
      var day = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      var entry = {
        key: dateKey(day),
        label: i === 0 ? "今天" : WEEKDAY_LABELS[day.getDay()],
        count: 0
      };
      days.push(entry);
      bucket[entry.key] = entry;
    }

    var chars = 0;
    var today = 0;

    for (var j = 0; j < posts.length; j += 1) {
      var post = posts[j];
      chars += charLength(post.content);
      if (post.createdAt >= todayStart) today += 1;

      var hit = bucket[dateKey(new Date(post.createdAt))];
      if (hit) hit.count += 1;
    }

    var weekTotal = 0;
    for (var k = 0; k < days.length; k += 1) {
      weekTotal += days[k].count;
    }

    return {
      total: posts.length,
      chars: chars,
      today: today,
      weekTotal: weekTotal,
      days: days
    };
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      els.toast.classList.remove("is-visible");
    }, 2600);
  }

  /* ---------------------------------------------------------
     视图层
     --------------------------------------------------------- */
  function buildPostNode(post) {
    var li = document.createElement("li");
    li.className = "post";
    li.dataset.id = post.id;

    var head = document.createElement("div");
    head.className = "post__head";

    var avatar = document.createElement("span");
    avatar.className = "post__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "我";

    var meta = document.createElement("div");
    meta.className = "post__meta";

    var author = document.createElement("span");
    author.className = "post__author";
    author.textContent = "我";

    var time = document.createElement("time");
    time.className = "post__time";
    time.dateTime = new Date(post.createdAt).toISOString();
    time.textContent = formatRelativeTime(post.createdAt);

    meta.appendChild(author);
    meta.appendChild(time);
    head.appendChild(avatar);
    head.appendChild(meta);

    var content = document.createElement("p");
    content.className = "post__content";
    content.textContent = post.content;

    li.appendChild(head);
    li.appendChild(content);
    return li;
  }

  var view = {
    renderList: function (posts) {
      els.timeline.textContent = "";
      if (!posts.length) {
        this.updateEmptyState(true);
        this.updateCount(0);
        return;
      }

      var fragment = document.createDocumentFragment();
      for (var i = 0; i < posts.length; i += 1) {
        fragment.appendChild(buildPostNode(posts[i]));
      }
      els.timeline.appendChild(fragment);
      this.updateEmptyState(false);
      this.updateCount(posts.length);
    },

    prependItem: function (post) {
      var node = buildPostNode(post);
      els.timeline.insertBefore(node, els.timeline.firstChild);
      this.updateEmptyState(false);
      this.updateCount(els.timeline.children.length);
    },

    updateEmptyState: function (isEmpty) {
      els.emptyState.classList.toggle("is-visible", isEmpty);
    },

    updateCount: function (count) {
      els.feedCount.textContent = count + " 条";
    },

    updateCounter: function (length) {
      els.counterValue.textContent = String(length);
      els.counter.classList.toggle("is-near", length >= MAX_LENGTH * 0.9 && length <= MAX_LENGTH);
      els.counter.classList.toggle("is-over", length > MAX_LENGTH);
    },

    toggleSubmit: function (enabled) {
      els.submit.disabled = !enabled;
    },

    resetComposer: function () {
      els.input.value = "";
      els.input.style.height = "auto";
      this.updateCounter(0);
      this.toggleSubmit(false);
    },

    flashSuccess: function () {
      var button = els.submit;
      var label = button.querySelector(".btn__label");
      button.classList.add("is-success");
      if (label) label.textContent = "已发布";
      window.clearTimeout(state.successTimer);
      state.successTimer = window.setTimeout(function () {
        button.classList.remove("is-success");
        if (label) label.textContent = "发布";
      }, 900);
    }
  };

  /* ---------------------------------------------------------
     统计看板视图
     --------------------------------------------------------- */
  function setMetric(el, value, animate) {
    el.textContent = formatMetric(value);
    if (!animate) return;
    var box = el.parentNode;
    box.classList.remove("is-bump");
    void box.offsetWidth;
    box.classList.add("is-bump");
  }

  var statsView = {
    update: function (stats, animate) {
      setMetric(els.statTotal, stats.total, animate);
      setMetric(els.statChars, stats.chars, animate);
      setMetric(els.statToday, stats.today, animate);
      this.renderChart(stats);
    },

    renderChart: function (stats) {
      var hasData = stats.weekTotal > 0;
      els.chart.textContent = "";
      els.chart.classList.toggle("is-empty", !hasData);
      els.chartEmpty.classList.toggle("is-visible", !hasData);

      if (!hasData) {
        els.chart.setAttribute("aria-label", "近 7 天还没有发布记录");
        return;
      }

      var max = 0;
      for (var i = 0; i < stats.days.length; i += 1) {
        if (stats.days[i].count > max) max = stats.days[i].count;
      }

      var fragment = document.createDocumentFragment();
      var summary = [];

      for (var j = 0; j < stats.days.length; j += 1) {
        var day = stats.days[j];
        var isToday = j === stats.days.length - 1;

        var col = document.createElement("div");
        col.className = "chart__col" + (isToday ? " is-today" : "");
        col.title = day.label + " · " + day.count + " 条";

        var count = document.createElement("span");
        count.className = "chart__count";
        count.textContent = day.count > 0 ? String(day.count) : "";

        var track = document.createElement("div");
        track.className = "chart__track";

        var bar = document.createElement("span");
        bar.className = "chart__bar";
        if (day.count > 0) {
          var pct = Math.max(8, Math.round((day.count / max) * 100));
          bar.style.setProperty("--bar", pct + "%");
        } else {
          bar.classList.add("is-zero");
        }
        track.appendChild(bar);

        var label = document.createElement("span");
        label.className = "chart__day";
        label.textContent = day.label;

        col.appendChild(count);
        col.appendChild(track);
        col.appendChild(label);
        fragment.appendChild(col);
        summary.push(day.label + " " + day.count + " 条");
      }

      els.chart.appendChild(fragment);
      els.chart.setAttribute("aria-label", "近 7 天共发布 " + stats.weekTotal + " 条：" + summary.join("，"));
    }
  };

  /* ---------------------------------------------------------
     控制层
     --------------------------------------------------------- */
  var currentDayKey = dateKey(new Date());

  function refreshStats(animate) {
    statsView.update(computeStats(state.posts, Date.now()), animate);
  }

  function checkDayRollover() {
    var key = dateKey(new Date());
    if (key !== currentDayKey) {
      currentDayKey = key;
      refreshStats(false);
    }
  }

  function refreshTimestamps() {
    var nodes = els.timeline.querySelectorAll(".post");
    for (var i = 0; i < nodes.length; i += 1) {
      var id = nodes[i].dataset.id;
      var post = findPost(id);
      if (!post) continue;
      var time = nodes[i].querySelector(".post__time");
      if (time) time.textContent = formatRelativeTime(post.createdAt);
    }
  }

  function findPost(id) {
    for (var i = 0; i < state.posts.length; i += 1) {
      if (state.posts[i].id === id) return state.posts[i];
    }
    return null;
  }

  function resizeInput() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 320) + "px";
  }

  function syncComposer() {
    var value = els.input.value;
    var trimmed = value.trim();
    var length = value.length;

    view.updateCounter(length);
    view.toggleSubmit(trimmed.length > 0 && length <= MAX_LENGTH);
    resizeInput();
  }

  function publish() {
    if (state.composing) return;

    var content = els.input.value.trim();
    var rawLength = els.input.value.length;

    if (!content) {
      showToast("写点什么再发布吧");
      els.input.focus();
      return;
    }
    if (rawLength > MAX_LENGTH) {
      showToast("内容超出 " + MAX_LENGTH + " 字限制");
      return;
    }

    var post = {
      id: createId(),
      content: content,
      createdAt: Date.now()
    };

    state.posts = [post].concat(state.posts).slice(0, MAX_ENTRIES);
    var saved = store.save(state.posts);

    view.prependItem(post);
    refreshStats(true);
    view.resetComposer();
    view.flashSuccess();
    els.input.focus();

    if (!saved) {
      showToast("已发布，但本地存储不可用，刷新后会丢失");
    } else {
      showToast("发布成功");
    }
  }

  function bindEvents() {
    els.submit.addEventListener("click", publish);

    els.input.addEventListener("input", syncComposer);

    els.input.addEventListener("compositionstart", function () {
      state.composing = true;
    });

    els.input.addEventListener("compositionend", function () {
      state.composing = false;
      syncComposer();
    });

    els.input.addEventListener("keydown", function (event) {
      var isEnter = event.key === "Enter";
      var withMeta = event.ctrlKey || event.metaKey;
      if (isEnter && withMeta && !state.composing) {
        event.preventDefault();
        if (!els.submit.disabled) publish();
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        refreshTimestamps();
        checkDayRollover();
      }
    });

    window.setInterval(function () {
      refreshTimestamps();
      checkDayRollover();
    }, 60 * 1000);
  }

  function init() {
    state.posts = store.load();
    view.renderList(state.posts);
    refreshStats(false);
    view.updateCounter(0);
    view.toggleSubmit(false);
    bindEvents();
    els.input.focus();

    if (!state.storageAvailable) {
      showToast("本地存储不可用，当前内容仅保存在内存中");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
