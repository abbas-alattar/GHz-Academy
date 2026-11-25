(function () {
  const isPhone = () => window.matchMedia("(max-width: 1023px)").matches;
  const isStudent = /student/i.test(location.pathname) || document.body.classList.contains("student-portal");
  const isTrainer = /trainer/i.test(location.pathname) || document.body.classList.contains("trainer-portal");
  let lastAv = null;
  let userOpenedSheet = false;
  let closingHistory = false;
  const lineIco = (d) => '<svg class="m-who-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';

  function unlockScroll() {
    document.body.classList.remove("scroll-locked", "no-scroll");
    document.documentElement.classList.remove("scroll-locked", "no-scroll");
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.height = "";
    document.documentElement.style.overflow = "";
    document.documentElement.style.position = "";
    document.documentElement.style.height = "";
  }
  function hideOverlays() {
    document.querySelectorAll(".m-who-layer, .m-who-scrim, .ghz-scrim, .m-note-layer, .m-note-scrim").forEach((el) => {
      el.style.pointerEvents = "none";
      if (!document.body.classList.contains("m-who-open") && !document.body.classList.contains("ghz-nav-open") && !document.body.classList.contains("m-note-open")) {
        el.style.display = "none";
      }
    });
  }
  function closeAllSheets(reason) {
    console.log("[ghz-sheet] closeAll", reason || "");
    document.body.classList.remove("ghz-nav-open", "m-search-open", "m-who-open", "stu-drawer", "m-note-open");
    document.querySelectorAll(".pc1-sheet.open, .pc1-modal").forEach((el) => {
      el.classList.remove("open");
      if (el.classList.contains("pc1-modal")) el.hidden = true;
    });
    unlockScroll();
    hideOverlays();
    if (lastAv && typeof lastAv.focus === "function") lastAv.focus();
  }
  function closeSheet() { closeAllSheets("close"); }
  function closeAll() { closeAllSheets("close"); }
  function markUserOpen() { userOpenedSheet = true; }
  function openNav() {
    if (document.body.classList.contains("ghz-nav-open")) return;
    markUserOpen();
    document.body.classList.add("ghz-nav-open");
    document.body.style.overflow = "hidden";
    const scrim = document.querySelector(".ghz-scrim");
    if (scrim) { scrim.style.display = ""; scrim.style.pointerEvents = "auto"; }
  }
  function trainerTitles(raw) {
    const k = String(raw || "courses").replace(/^#/, "").split("/")[0].toLowerCase();
    const map = {
      courses: "My courses", homework: "Homework", quizzes: "Quizzes", grades: "Grades",
      attendance: "Attendance", announcements: "Announcements", profilev2: "Profile", profile: "Profile"
    };
    return map[k] || "My courses";
  }
  function logTrainerTopbar() {
    if (!isTrainer || !window.matchMedia("(max-width: 767px)").matches) return;
    const bar = document.querySelector(".topbar-mobile");
    if (!bar) return;
    const kids = [...bar.children].map((el) => {
      const r = el.getBoundingClientRect();
      return { cls: el.className, left: Math.round(r.left), right: Math.round(r.right) };
    });
    console.log("[ghz-topbar]", kids);
  }
  function wireTrainerMobileBar() {
    if (!isTrainer) return;
    const bar = document.querySelector(".topbar-mobile");
    if (!bar || bar.dataset.wired) return;
    bar.dataset.wired = "1";
    const ico = (d) => '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
    const setTitle = () => {
      const t = trainerTitles(location.hash || "#courses");
      const el = bar.querySelector(".tm-title");
      if (el) el.textContent = t;
      const desk = document.getElementById("pageTitle");
      if (desk) desk.textContent = t;
    };
    setTitle();
    window.addEventListener("hashchange", setTitle);
    bar.querySelectorAll(".tm-btn, .tm-avatar").forEach((b) => { b.style.touchAction = "manipulation"; });
    const av = bar.querySelector(".tm-avatar");
    const fillIni = () => {
      const nm = (document.getElementById("userName")?.textContent || "TR").trim();
      if (av) av.textContent = nm.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "TR";
    };
    fillIni();
    function openAccountSheet() {
      closeAllSheets("open account");
      markUserOpen();
      lastAv = av;
      fillIni();
      const wrap = document.querySelector(".m-who-layer");
      const nm = (document.getElementById("userName")?.textContent || "Trainer").trim();
      const ini = nm.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "TR";
      if (wrap) {
        wrap.querySelector(".m-who-av").textContent = ini;
        wrap.querySelector(".m-who-name").textContent = nm;
        wrap.querySelector(".m-who-sub").textContent = "Trainer";
      }
      document.body.classList.add("m-who-open");
      document.body.style.overflow = "hidden";
      if (wrap) { wrap.style.display = ""; wrap.style.pointerEvents = "auto"; }
      const sc = document.querySelector(".m-who-scrim");
      if (sc) { sc.style.display = ""; sc.style.pointerEvents = "auto"; }
      console.log("[ghz-sheet] open account");
    }
    function noteRel(ms) {
      const d = Date.now() - (ms || 0);
      if (d < 60000) return "just now";
      if (d < 3600000) return Math.max(1, Math.floor(d / 60000)) + " min ago";
      if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
      return Math.floor(d / 86400000) + "d ago";
    }
    function noteChip(n) {
      const t = String(n.type || "") + " " + String(n.category || "") + " " + String(n.title || "");
      if (/hw|homework/i.test(t)) return { bg: "#DBEAFE", fg: "#2563EB", d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" };
      if (/attend/i.test(t)) return { bg: "#DCFCE7", fg: "#16A34A", d: "M9 11l3 3L22 4" };
      if (/ann/i.test(t)) return { bg: "#FFEDD5", fg: "#EA580C", d: "M3 11v2h2l8 5V6L5 11H3z M19 8a5 5 0 010 8" };
      if (/grade|quiz/i.test(t)) return { bg: "#CCFBF1", fg: "#0D9488", d: "M12 20V10 M18 20V4 M6 20v-6" };
      if (/course|enroll|reg/i.test(t)) return { bg: "#EDE9FE", fg: "#7C3AED", d: "M4 19.5A2.5 2.5 0 016.5 17H20 M4 4.5A2.5 2.5 0 016.5 7H20v13H6.5A2.5 2.5 0 014 17.5z" };
      return { bg: "#F1F5F9", fg: "#64748B", d: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" };
    }
    function ensureNoteSheet() {
      let layer = document.querySelector(".m-note-layer");
      if (layer) return layer;
      layer = document.createElement("div");
      layer.className = "m-note-layer phone-only";
      layer.innerHTML = '<div class="m-note-scrim" tabindex="-1"></div><div class="m-note-menu" role="dialog" aria-label="Notifications"><div class="m-who-handle"></div><div class="m-note-head"><h2>Notifications</h2><button type="button" class="m-note-mark">Mark all as read</button></div><div class="m-note-list"></div></div>';
      document.body.appendChild(layer);
      layer.querySelector(".m-note-scrim").addEventListener("click", () => closeAllSheets("overlay"));
      layer.querySelector(".m-note-mark").addEventListener("click", () => {
        window.__ghzNv2?.markAll?.();
        paintNotes();
      });
      let sy = 0;
      const menu = layer.querySelector(".m-note-menu");
      menu.addEventListener("touchstart", (e) => { sy = e.touches[0].clientY; }, { passive: true });
      menu.addEventListener("touchend", (e) => {
        const dy = (e.changedTouches[0]?.clientY || 0) - sy;
        if (dy > 56) closeAllSheets("swipe");
      }, { passive: true });
      return layer;
    }
    function paintNotes() {
      const list = document.querySelector(".m-note-list");
      if (!list) return;
      const st = window.__ghzNv2?.getState?.();
      const items = (st && Array.isArray(st.items) ? st.items : []).filter((n) => !(st.hidden || []).includes(n.id));
      const read = new Set(st?.readIds || []);
      const seenAt = st?.seenAt || 0;
      if (!st || st.loading) {
        list.innerHTML = '<div class="m-note-sk"></div><div class="m-note-sk"></div><div class="m-note-sk"></div>';
        return;
      }
      if (!items.length) {
        list.innerHTML = '<div class="m-note-empty">' + lineIco("M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0") + '<p>You\'re all caught up</p></div>';
        return;
      }
      list.innerHTML = items.slice(0, 40).map((n) => {
        const unread = !read.has(n.id) && n.time > seenAt;
        const chip = noteChip(n);
        const title = String(n.title || "Notification").replace(/</g, "");
        const msg = String(n.message || n.courseTitle || "").replace(/</g, "");
        return '<button type="button" class="m-note-row' + (unread ? ' unread' : '') + '" data-id="' + n.id + '">' +
          '<span class="m-note-chip" style="background:' + chip.bg + ';color:' + (chip.fg || '#0F2747') + '">' + lineIco(chip.d) + '</span>' +
          '<span class="m-note-body"><strong>' + title + '</strong><span class="m-note-txt">' + msg + '</span><span class="m-note-time">' + noteRel(n.time) + '</span></span>' +
          (unread ? '<span class="m-note-unread"></span>' : '') + '</button>';
      }).join("");
      list.querySelectorAll(".m-note-row").forEach((row) => {
        row.style.touchAction = "manipulation";
        row.addEventListener("click", () => {
          const n = items.find((x) => x.id === row.getAttribute("data-id"));
          if (n && window.__ghzNv2?.markOne) window.__ghzNv2.markOne(n);
          row.classList.remove("unread");
          closeAllSheets("navigation");
          if (n && window.__ghzNv2?.openItem) window.__ghzNv2.openItem(n);
          else if (n) location.hash = "homework";
        });
      });
    }
    function openNotesSheet() {
      closeAllSheets("open notifications");
      markUserOpen();
      const layer = ensureNoteSheet();
      document.body.classList.add("m-note-open");
      document.body.style.overflow = "hidden";
      layer.style.display = ""; layer.style.pointerEvents = "auto";
      const sc = layer.querySelector(".m-note-scrim");
      if (sc) { sc.style.display = ""; sc.style.pointerEvents = "auto"; }
      paintNotes();
      console.log("[ghz-sheet] open notifications");
      window.__ghzNv2?.refresh?.(false)?.then?.(() => paintNotes());
    }
    bar.querySelector(".tm-menu")?.addEventListener("click", () => {
      closeAllSheets("open drawer");
      if (document.body.classList.contains("ghz-nav-open")) closeAll();
      else openNav();
    });
    bar.querySelector(".tm-search")?.addEventListener("click", () => {
      closeAllSheets("open search");
      markUserOpen();
      document.body.classList.add("m-search-open");
      const inp = document.querySelector(".m-search-panel input");
      if (inp) inp.focus();
    });
    bar.querySelector(".tm-bell")?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      openNotesSheet();
    });
    av?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      openAccountSheet();
    });
    const syncDot = () => {
      const st = window.__ghzNv2?.getState?.();
      const dot = bar.querySelector(".tm-dot");
      if (!dot) return;
      const unread = st ? Number(st.badge || 0) > 0 : false;
      if (unread) dot.removeAttribute("hidden"); else dot.setAttribute("hidden", "");
    };
    syncDot();
    setInterval(syncDot, 1500);
    requestAnimationFrame(logTrainerTopbar);
    window.addEventListener("resize", logTrainerTopbar);
    window.addEventListener("hashchange", () => setTimeout(logTrainerTopbar, 50));
  }
  function ensureChrome() {
    wireTrainerMobileBar();
    if (!isTrainer && !document.querySelector(".ghz-navbtn")) {
      const top = document.querySelector(".top");
      if (top) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ghz-navbtn phone-only";
        btn.setAttribute("aria-label", "Open menu");
        btn.innerHTML = "<span></span>";
        btn.addEventListener("click", () => {
          if (document.body.classList.contains("ghz-nav-open")) closeAll();
          else openNav();
        });
        top.insertBefore(btn, top.firstChild);
      }
    }
    if (!document.querySelector(".ghz-scrim")) {
      const scrim = document.createElement("div");
      scrim.className = "ghz-scrim phone-only";
      scrim.addEventListener("click", () => closeAllSheets("overlay"));
      document.body.appendChild(scrim);
    }
    const actions = document.querySelector(".top-actions");
    if (!isTrainer && actions && !actions.querySelector(".ghz-search-ico")) {
      const ico = document.createElement("button");
      ico.type = "button";
      ico.className = "ghz-search-ico phone-only";
      ico.setAttribute("aria-label", "Search");
      ico.textContent = "⌕";
      ico.addEventListener("click", () => {
        markUserOpen();
        document.body.classList.add("m-search-open");
        const inp = document.querySelector(".m-search-panel input");
        if (inp) inp.focus();
      });
      actions.insertBefore(ico, actions.firstChild);
    }
    if (!document.querySelector(".m-search-panel")) {
      const pan = document.createElement("div");
      pan.className = "m-search-panel";
      pan.innerHTML = '<input type="search" placeholder="Search…" aria-label="Search" />';
      document.body.appendChild(pan);
      pan.querySelector("input").addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeAll();
      });
    }
    const who = document.querySelector(".who");
    if (isStudent && !isTrainer && actions && !actions.querySelector(".stu-av")) {
      const av = document.createElement("button");
      av.type = "button"; av.className = "stu-av phone-only"; av.setAttribute("aria-label", "Account");
      const nm = (document.getElementById("userName")?.textContent || "S").trim();
      av.textContent = nm.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "S";
      actions.appendChild(av);
      av.addEventListener("click", (e) => {
        if (!window.matchMedia("(max-width: 767px)").matches) return;
        e.preventDefault(); e.stopPropagation();
        lastAv = av;
        markUserOpen();
        document.body.classList.add("m-who-open");
        document.body.style.overflow = "hidden";
        const layer = document.querySelector(".m-who-layer");
        if (layer) { layer.style.display = ""; layer.style.pointerEvents = "auto"; }
        const sc = document.querySelector(".m-who-scrim");
        if (sc) { sc.style.display = ""; sc.style.pointerEvents = "auto"; }
      });
    }
    if ((who || isTrainer) && !document.querySelector(".m-who-menu")) {
      const wrap = document.createElement("div");
      wrap.className = "m-who-layer phone-only";
      wrap.innerHTML = '<div class="m-who-scrim" tabindex="-1"></div><div class="m-who-menu" role="dialog" aria-label="Account"><div class="m-who-handle"></div><div class="m-who-user"><span class="m-who-av"></span><div class="m-who-meta"><p class="m-who-name"></p><p class="m-who-sub"></p></div></div><div class="m-who-div"></div><button class="m-who-row" type="button" id="mWhoProfile">' + lineIco("M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z") + 'Profile</button><button class="m-who-row m-who-out" type="button" id="mWhoOut">' + lineIco("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9") + 'Log out</button></div>';
      document.body.appendChild(wrap);
      const menu = wrap.querySelector(".m-who-menu");
      const fillWho = () => {
        const nm = (document.getElementById("userName")?.textContent || "Student").trim();
        const ini = nm.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "S";
        const sid = (window.__ghzDash?.studentId || document.querySelector(".who-sid")?.textContent || "").replace(/^ID\s*/i, "").trim();
        wrap.querySelector(".m-who-av").textContent = ini;
        wrap.querySelector(".m-who-name").textContent = nm;
          wrap.querySelector(".m-who-sub").textContent = isTrainer ? "Trainer" : (sid ? ("Student \u00b7 ID " + sid) : "Student");
      };
      fillWho();
      who.addEventListener("click", (e) => {
        if (!window.matchMedia("(max-width: 767px)").matches) return;
        e.preventDefault();
        e.stopPropagation();
        fillWho();
        lastAv = document.querySelector(".stu-av") || who;
        markUserOpen();
        document.body.classList.add("m-who-open");
        document.body.style.overflow = "hidden";
        wrap.style.display = ""; wrap.style.pointerEvents = "auto";
        wrap.querySelector(".m-who-scrim").style.display = "";
        wrap.querySelector(".m-who-scrim").style.pointerEvents = "auto";
      }, true);
      wrap.querySelector(".m-who-scrim")?.addEventListener("click", () => closeAllSheets("overlay"));
      wrap.querySelector("#mWhoProfile")?.addEventListener("click", () => {
        closeAllSheets("navigation");
        location.hash = isTrainer ? "profile" : "profilev2";
        window.__bootProfile?.();
      });
      wrap.querySelector("#mWhoOut")?.addEventListener("click", () => {
        closeAllSheets("navigation");
        document.getElementById("logoutBtn")?.click();
      });
      let sy = 0;
      menu.addEventListener("touchstart", (e) => { sy = e.touches[0].clientY; }, { passive: true });
      menu.addEventListener("touchend", (e) => {
        const dy = (e.changedTouches[0]?.clientY || 0) - sy;
        if (dy > 56) closeAllSheets("swipe");
      }, { passive: true });
    }
    const aside = document.querySelector(".portal > .side");
    if (aside && !aside.querySelector(".stu-logout-row")) {
      const a = document.createElement("button");
      a.type = "button"; a.className = "stu-logout-row phone-only"; a.textContent = "Log out";
      a.addEventListener("click", () => document.getElementById("logoutBtn")?.click());
      const dock = aside.querySelector(".stu-theme-root") || aside.querySelector(".user");
      if (dock) aside.insertBefore(a, dock); else aside.appendChild(a);
    }
    const logOverflow = () => {
      if (!window.matchMedia("(max-width: 767px)").matches) return;
      requestAnimationFrame(() => {
        const w = window.innerWidth;
        const hits = [];
        const barEl = document.querySelector(".topbar-mobile") || document.querySelector(".top");
        const card = document.querySelector(".th2-kpi, .tr2-card, .th2-card");
        if (barEl) {
          const br = barEl.getBoundingClientRect();
          console.log("[ghz-inset] topbar", Math.round(br.left), Math.round(br.right));
        }
        if (card) {
          const cr = card.getBoundingClientRect();
          console.log("[ghz-inset] card", Math.round(cr.left), Math.round(cr.right));
        }
        document.querySelectorAll("body *").forEach((el) => {
          try {
            const r = el.getBoundingClientRect();
            if (r.right > w + 1) {
              hits.push((el.className || el.tagName) + " right=" + Math.round(r.right));
              console.log("[ghz-overflow]", el.tagName, el.className, r.right);
            }
          } catch {}
        });
        console.log("[ghz-overflow] list", hits);
        const top = document.querySelector(".top");
        const btns = top ? [...top.querySelectorAll("button, a, .stu-av, .notify-btn, .ghz-navbtn, .ghz-search-ico, .ghz-menu")].map((el) => el.className + ":" + Math.round(el.getBoundingClientRect().width)) : [];
        console.log("[ghz-topbar]", btns);
      });
    };
    logOverflow();
    window.addEventListener("hashchange", () => setTimeout(logOverflow, 300));
    if ((isStudent || isTrainer) && window.matchMedia("(max-width: 767px)").matches && !document.querySelector(".m-tabs")) {
      document.body.classList.add(isTrainer ? "trainer-portal" : "student-portal", "m-has-tabs");
      const bar = document.createElement("nav");
      bar.className = "m-tabs phone-only";
      bar.setAttribute("aria-label", isTrainer ? "Trainer" : "Student");
      const ico = (d) => '<svg class="m-tab-ico" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
      const page = isTrainer ? "./trainer.html#" : "./student.html#";
      const items = isTrainer ? [
        ["courses", "My courses", ico("M2 4h6a4 4 0 014 4v12a3 3 0 00-3-3H2z M22 4h-6a4 4 0 00-4 4v12a3 3 0 013-3h7z")],
        ["homework", "Homework", ico("M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M9 15l2 2 4-4")],
        ["attendance", "Attendance", ico("M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11")],
        ["grades", "Grades", ico("M12 20V10 M18 20V4 M6 20v-6")]
      ] : [
        ["dash", "Dashboard", ico("M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z")],
        ["courses", "My courses", ico("M2 4h6a4 4 0 014 4v12a3 3 0 00-3-3H2z M22 4h-6a4 4 0 00-4 4v12a3 3 0 013-3h7z")],
        ["homework", "Homework", ico("M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M9 15l2 2 4-4")],
        ["grades", "Grades", ico("M12 20V10 M18 20V4 M6 20v-6")]
      ];
      bar.innerHTML = items.map(([k, t, ic]) =>
        '<a class="m-tab" data-tab="' + k + '" href="' + page + k + '">' + ic + '<span>' + t + "</span></a>"
      ).join("") + '<button type="button" class="m-tab" data-more data-tab="more">' + ico("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z") + '<span>More</span></button>';
      document.body.appendChild(bar);
      const mark = () => {
        let raw = (location.hash || (isTrainer ? "#courses" : "#dash")).replace(/^#/, "").split(/[/?]/)[0].toLowerCase();
        if (!raw) raw = isTrainer ? "courses" : "dash";
        let tab = "more";
        if (!isTrainer && (raw === "dash" || raw === "dashboard")) tab = "dash";
        else if (raw === "courses" || raw === "coursesv2" || raw === "course" || raw === "coursecontent" || raw === "roster" || (raw === "" && isTrainer)) tab = "courses";
        else if (raw === "homework" || raw === "homeworkv2" || raw === "hwavg" || raw === "homework-averages") tab = "homework";
        else if (raw === "attendance" || raw === "attend" || raw === "takeatt") tab = "attendance";
        else if (raw === "grades" || raw === "gradesv2") tab = "grades";
        bar.querySelectorAll(".m-tab").forEach((el) => {
          el.classList.toggle("on", el.getAttribute("data-tab") === tab);
        });
      };
      mark();
      window.addEventListener("hashchange", mark);
      window.addEventListener("popstate", mark);
      bar.querySelectorAll(".m-tab[href]").forEach((a) => {
        a.addEventListener("click", () => closeAllSheets("navigation"));
      });
      bar.querySelector("[data-more]")?.addEventListener("click", () => openNav());
      let lastY = window.scrollY;
      const hideBar = () => {
        const kb = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        const overlay = document.body.classList.contains("ghz-nav-open") || document.body.classList.contains("stu-drawer") || document.body.classList.contains("m-who-open") || document.body.classList.contains("m-search-open") || document.querySelector(".pc1-sheet.open, .pc1-sheet[open], dialog[open]");
        document.body.classList.toggle("m-tabs-hide", !!(kb || overlay));
      };
      document.addEventListener("focusin", hideBar, true);
      document.addEventListener("focusout", hideBar, true);
      window.addEventListener("scroll", () => {
        const y = window.scrollY;
        if (!(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) {
          document.body.classList.toggle("m-tabs-hide", y > lastY && y > 24);
        }
        lastY = y;
        hideBar();
      }, { passive: true });
      new MutationObserver(hideBar).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllSheets("close");
  });
  window.addEventListener("popstate", () => {
    closingHistory = true;
    closeAllSheets("popstate");
    closingHistory = false;
  });
  window.addEventListener("hashchange", () => closeAllSheets("navigation"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !userOpenedSheet) closeAllSheets("load");
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && !userOpenedSheet) closeAllSheets("load");
  });
  window.closeAllSheets = closeAllSheets;

  function bootClosed() {
    ensureChrome();
    closeAllSheets("load");
    userOpenedSheet = false;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootClosed);
  else bootClosed();
})();
