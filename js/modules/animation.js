import * as DOM from "./dom.js";
import { victorySound, speakWord, stopSpeech } from "./audio.js";
import { compressSettings } from "./ui.js";

let barendroomAnimationId = null;

export function stopBouncingAnimation() {
  if (barendroomAnimationId) {
    cancelAnimationFrame(barendroomAnimationId);
    barendroomAnimationId = null;
    const overlay = document.getElementById("barendroom-2d-overlay");
    if (overlay) document.body.removeChild(overlay);
  }
}

export function startBouncingAnimation(originalCells, settings, onReturn) {
  stopBouncingAnimation();
  victorySound.currentTime = 0;
  victorySound.play().catch((e) => console.error("Audio play failed:", e));

  const overlay = document.createElement("div");
  overlay.id = "barendroom-2d-overlay";

  const canvas = document.createElement("canvas");
  canvas.id = "trace-canvas";
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const bouncingButtons = originalCells.map((cell) => {
    const rect = cell.getBoundingClientRect();
    overlay.appendChild(cell);
    cell.classList.add("bouncing-cell");
    cell.classList.remove("cell", "active");
    cell.style.width = `${rect.width}px`;
    cell.style.height = `${rect.height}px`;
    cell.style.left = "0px";
    cell.style.top = "0px";
    cell.style.cursor = "grab";

    return {
      el: cell,
      x: rect.left,
      y: rect.top,
      vx: Math.random() * 8 - 4,
      vy: Math.random() * -10 - 5,
      width: rect.width,
      height: rect.height,
      trace: [],
      isDragged: false,
    };
  });

  DOM.outputCard.style.display = "none";
  let draggedButton = null;
  let dragOffsetX = 0,
    dragOffsetY = 0;
  let lastPos = { x: 0, y: 0 };
  const velocityHistory = [];
  const MAX_HISTORY = 5;
  let gravity = { x: 0, y: 0.3 };
  const friction = 0.995,
    bounceFactor = 0.8,
    restitution = 0.65;
  const maxTraceLength = 20,
    MAX_SPEED = 40;

  const handleOrientation = (event) => {
    if (event.accelerationIncludingGravity) {
      const GRAVITY_SCALE = 0.3 / 9.8;
      gravity.x = -event.accelerationIncludingGravity.x * GRAVITY_SCALE;
      gravity.y = event.accelerationIncludingGravity.y * GRAVITY_SCALE;
    }
  };

  if (
    window.DeviceMotionEvent &&
    typeof DeviceMotionEvent.requestPermission === "function"
  ) {
    DeviceMotionEvent.requestPermission()
      .then((state) => {
        if (state === "granted")
          window.addEventListener("devicemotion", handleOrientation);
      })
      .catch(console.error);
  } else {
    window.addEventListener("devicemotion", handleOrientation);
  }

  const confetti = [];
  const CONFETTI_COUNT = 150;
  const confettiColors = ["#6ee7f5", "#9b8cff", "#4ade80", "#ff4d6d"];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    confetti.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      width: Math.random() * 6 + 4,
      height: Math.random() * 12 + 8,
      vx: Math.random() * 2 - 1,
      vy: Math.random() * 2 + 2,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    });
  }

  function animate() {
    ctx.fillStyle = "#0f1226";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    confetti.forEach((c) => {
      c.x += c.vx;
      c.y += c.vy;
      c.rotation += c.rotationSpeed;
      if (c.y > canvas.height + 20) {
        c.x = Math.random() * canvas.width;
        c.y = -20;
      }
      ctx.save();
      ctx.translate(c.x + c.width / 2, c.y + c.height / 2);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);
      ctx.restore();
    });

    bouncingButtons.forEach((btn) => {
      if (!btn.isDragged) {
        btn.vx += gravity.x;
        btn.vy += gravity.y;
        btn.vx *= friction;
        btn.vy *= friction;
        btn.x += btn.vx;
        btn.y += btn.vy;
        if (btn.y + btn.height > window.innerHeight) {
          btn.y = window.innerHeight - btn.height;
          btn.vy *= -bounceFactor;
        }
        if (btn.x + btn.width > window.innerWidth) {
          btn.x = window.innerWidth - btn.width;
          btn.vx *= -bounceFactor;
        }
        if (btn.x < 0) {
          btn.x = 0;
          btn.vx *= -bounceFactor;
        }
        if (btn.y < 0) {
          btn.y = 0;
          btn.vy *= -bounceFactor;
        }
      }
    });

    for (let i = 0; i < bouncingButtons.length; i++) {
      for (let j = i + 1; j < bouncingButtons.length; j++) {
        const btn1 = bouncingButtons[i],
          btn2 = bouncingButtons[j];
        const dx = btn1.x + btn1.width / 2 - (btn2.x + btn2.width / 2);
        const dy = btn1.y + btn1.height / 2 - (btn2.y + btn2.height / 2);
        const combinedHalfWidths = (btn1.width + btn2.width) / 2;
        const combinedHalfHeights = (btn1.height + btn2.height) / 2;
        const overlapX = combinedHalfWidths - Math.abs(dx);
        const overlapY = combinedHalfHeights - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const nx = dx > 0 ? 1 : -1;
            btn1.x += (overlapX * nx) / 2;
            btn2.x -= (overlapX * nx) / 2;
            const rvx = btn2.vx - btn1.vx;
            const impulse = -(1 + restitution) * rvx * nx;
            btn1.vx -= impulse / 2;
            btn2.vx += impulse / 2;
          } else {
            const ny = dy > 0 ? 1 : -1;
            btn1.y += (overlapY * ny) / 2;
            btn2.y -= (overlapY * ny) / 2;
            const rvy = btn2.vy - btn1.vy;
            const impulse = -(1 + restitution) * rvy * ny;
            btn1.vy -= impulse / 2;
            btn2.vy += impulse / 2;
          }
        }
      }
    }

    bouncingButtons.forEach((btn) => {
      const speed = Math.sqrt(btn.vx * btn.vx + btn.vy * btn.vy);
      if (speed > MAX_SPEED) {
        btn.vx = (btn.vx / speed) * MAX_SPEED;
        btn.vy = (btn.vy / speed) * MAX_SPEED;
      }
      btn.el.style.transform = `translate(${btn.x}px, ${btn.y}px)`;
      btn.trace.push({ x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 });
      if (btn.trace.length > maxTraceLength) btn.trace.shift();
      if (btn.trace.length > 1) {
        ctx.beginPath();
        ctx.moveTo(btn.trace[0].x, btn.trace[0].y);
        for (let k = 1; k < btn.trace.length; k++)
          ctx.lineTo(btn.trace[k].x, btn.trace[k].y);
        const grad = ctx.createLinearGradient(
          btn.trace[0].x,
          btn.trace[0].y,
          btn.trace[btn.trace.length - 1].x,
          btn.trace[btn.trace.length - 1].y,
        );
        grad.addColorStop(0, "rgba(110, 231, 245, 0)");
        grad.addColorStop(1, "rgba(155, 140, 255, 0.7)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
    barendroomAnimationId = requestAnimationFrame(animate);
  }

  const handleStart = (clientX, clientY) => {
    for (let i = bouncingButtons.length - 1; i >= 0; i--) {
      const btn = bouncingButtons[i];
      if (
        clientX >= btn.x &&
        clientX <= btn.x + btn.width &&
        clientY >= btn.y &&
        clientY <= btn.y + btn.height
      ) {
        draggedButton = btn;
        stopSpeech(true);
        speakWord(draggedButton.el.textContent, settings);
        draggedButton.isDragged = true;
        draggedButton.el.style.cursor = "grabbing";
        draggedButton.el.style.zIndex = 1000;
        dragOffsetX = clientX - btn.x;
        dragOffsetY = clientY - btn.y;
        lastPos = { x: clientX, y: clientY };
        velocityHistory.length = 0;
        break;
      }
    }
  };
  const handleMove = (clientX, clientY) => {
    if (draggedButton) {
      draggedButton.x = clientX - dragOffsetX;
      draggedButton.y = clientY - dragOffsetY;
      const vx = clientX - lastPos.x,
        vy = clientY - lastPos.y;
      velocityHistory.push({ vx, vy });
      if (velocityHistory.length > MAX_HISTORY) velocityHistory.shift();
      lastPos = { x: clientX, y: clientY };
    }
  };
  const handleEnd = () => {
    if (draggedButton) {
      draggedButton.isDragged = false;
      draggedButton.el.style.cursor = "grab";
      draggedButton.el.style.zIndex = 1;
      if (velocityHistory.length > 0) {
        const avg = velocityHistory.reduce(
          (acc, v) => ({ vx: acc.vx + v.vx, vy: acc.vy + v.vy }),
          { vx: 0, vy: 0 },
        );
        draggedButton.vx = avg.vx / velocityHistory.length;
        draggedButton.vy = avg.vy / velocityHistory.length;
      }
      draggedButton = null;
    }
  };

  overlay.addEventListener("mousedown", (e) =>
    handleStart(e.clientX, e.clientY),
  );
  overlay.addEventListener("mousemove", (e) =>
    handleMove(e.clientX, e.clientY),
  );
  window.addEventListener("mouseup", handleEnd);
  overlay.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: false },
  );
  overlay.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (draggedButton && e.touches.length)
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: false },
  );
  window.addEventListener("touchend", handleEnd);
  animate();

  const popup = document.createElement("div");
  popup.className = "barendroom-congrats-popup";
  popup.innerHTML = `<h2>Gefeliciteerd!</h2><p>Je hebt een Barendroom gevonden!</p>`;
  popup.addEventListener("touchstart", (e) => e.stopPropagation());
  const popupActions = document.createElement("div");
  popupActions.className = "barendroom-popup-actions";
  const shareBarendroomBtn = document.createElement("button");
  shareBarendroomBtn.className = "btn ghost";
  shareBarendroomBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>Delen`;
  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "btn ghost";
  minimizeBtn.textContent = "Minimaliseren";
  const returnBtn = document.createElement("button");
  returnBtn.className = "btn primary";
  returnBtn.textContent = "Terug";
  popupActions.appendChild(shareBarendroomBtn);
  popupActions.appendChild(minimizeBtn);
  popupActions.appendChild(returnBtn);
  popup.appendChild(popupActions);
  overlay.appendChild(popup);

  shareBarendroomBtn.addEventListener("click", async () => {
    const wordToShare = DOM.input.value.trim();
    const compressed = compressSettings(settings);
    const baseUrl = window.location.origin + window.location.pathname;
    let shareUrl = `${baseUrl}?word=${encodeURIComponent(wordToShare)}`;
    if (Object.keys(compressed).length > 0) {
      shareUrl += `&s=${encodeURIComponent(btoa(JSON.stringify(compressed)))}`;
    }
    const shareData = {
      title: "Barend Generator",
      text: `Ik heb een Barendroom gevonden: "${wordToShare}"! 🎉`,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        shareBarendroomBtn.textContent = "✅ Gekopieerd!";
        setTimeout(() => {
          shareBarendroomBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>Delen`;
        }, 2000);
      }
    } catch (err) {
      console.error("Share failed:", err);
    }
  });

  minimizeBtn.addEventListener("click", () => {
    popup.style.transform = "translate(-50%, -50%) scale(0)";
    popup.style.opacity = "0";
    popup.style.pointerEvents = "none";
    if (!document.getElementById("restore-popup-btn")) {
      const restoreBtn = document.createElement("button");
      restoreBtn.id = "restore-popup-btn";
      restoreBtn.className = "btn ghost";
      restoreBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      restoreBtn.style.cssText =
        "position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:10002; width:48px; height:48px; border-radius:50%; padding:0;";
      const restoreAction = () => {
        popup.style.transform = "translate(-50%, -50%) scale(1)";
        popup.style.opacity = "1";
        popup.style.pointerEvents = "auto";
        if (overlay.contains(restoreBtn)) overlay.removeChild(restoreBtn);
      };
      restoreBtn.addEventListener("click", restoreAction);
      restoreBtn.addEventListener("touchstart", (e) => {
        e.stopPropagation();
        restoreAction();
      });
      overlay.appendChild(restoreBtn);
    }
  });

  returnBtn.addEventListener("click", () => {
    stopBouncingAnimation();
    window.removeEventListener("devicemotion", handleOrientation);
    onReturn();
  });
}
