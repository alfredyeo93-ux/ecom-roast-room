// The 3D roast room: a round table, four advisor seats, a hologram "Chair" globe
// in the middle, score rings under each seat and speech bubbles over each head.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const SEAT_RADIUS = 3.4;

export function createScene(container, personas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050a14);
  scene.fog = new THREE.Fog(0x050a14, 12, 26);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 6.4, 11.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.style.position = "absolute";
  labels.domElement.style.inset = "0";
  labels.domElement.style.pointerEvents = "none";
  container.appendChild(labels.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.1, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 6;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.46;

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x0a1020, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  // ---------- floor ----------
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a1426, roughness: 0.85, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.PolarGridHelper(12, 16, 10, 64, 0x1b2b48, 0x122038);
  grid.position.y = 0.01;
  scene.add(grid);

  // ---------- table ----------
  const table = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.1, 0.14, 64),
    new THREE.MeshStandardMaterial({ color: 0x111d33, roughness: 0.25, metalness: 0.6 })
  );
  top.position.y = 0.95;
  top.castShadow = top.receiveShadow = true;
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.6, 0.9, 32),
    new THREE.MeshStandardMaterial({ color: 0x0c1528, roughness: 0.6 })
  );
  leg.position.y = 0.45;
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x2ee6c5 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.025, 8, 96), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.02;
  table.add(top, leg, rim);
  scene.add(table);

  // ---------- the Chair: hologram globe ----------
  const globe = new THREE.Group();
  const globeMat = new THREE.MeshBasicMaterial({ color: 0x9aa7ff, wireframe: true, transparent: true, opacity: 0.55 });
  const globeMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 2), globeMat);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x9aa7ff, transparent: true, opacity: 0.18 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), coreMat);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.9, 1.0, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x9aa7ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
  );
  beam.position.y = -0.85;
  globe.add(globeMesh, core, beam);
  globe.position.y = 2.3;
  scene.add(globe);

  const chairLabelEl = document.createElement("div");
  chairLabelEl.className = "nameplate";
  chairLabelEl.innerHTML = `<span class="pill" style="--c:#9aa7ff">THE CHAIR</span><span class="score" style="--c:#9aa7ff;display:none"></span>`;
  const chairScoreEl = chairLabelEl.querySelector(".score");
  const chairLabel = new CSS2DObject(chairLabelEl);
  chairLabel.position.set(0, 3.35, 0);
  scene.add(chairLabel);

  // ---------- seats + advisors ----------
  const seats = {};
  personas.forEach((p, i) => {
    const angle = (i / personas.length) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(angle) * SEAT_RADIUS;
    const z = Math.cos(angle) * SEAT_RADIUS;
    const color = new THREE.Color(p.color);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.lookAt(0, 0, 0);

    // chair
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x18253f, roughness: 0.5, metalness: 0.3 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.9), chairMat);
    seat.position.y = 0.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.12), chairMat);
    back.position.set(0, 1.15, -0.45);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 12), chairMat);
    stem.position.y = 0.3;
    [seat, back, stem].forEach((m) => (m.castShadow = true));
    g.add(seat, back, stem);

    // advisor: coloured body + the clay portrait as a camera-facing round head
    const avatar = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 6, 16), bodyMat);
    body.position.y = 1.15;
    body.castShadow = true;
    const head = new THREE.Sprite(
      // toneMapped/fog off so the portrait renders with its original colours
      new THREE.SpriteMaterial({ map: portraitTexture(p.id, p.color), transparent: true, toneMapped: false, fog: false })
    );
    head.scale.set(0.95, 0.95, 1);
    head.position.y = 1.98;
    avatar.add(body, head);
    g.add(avatar);

    // score ring on the floor
    const ringBase = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.85, 64),
      new THREE.MeshBasicMaterial({ color: 0x1b2b48, side: THREE.DoubleSide })
    );
    ringBase.rotation.x = -Math.PI / 2;
    ringBase.position.y = 0.02;
    const ringFill = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.85, 64, 1, 0, 0.0001),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    ringFill.rotation.x = -Math.PI / 2;
    ringFill.position.y = 0.03;
    g.add(ringBase, ringFill);

    // spotlight
    const spot = new THREE.SpotLight(color, 0, 7, Math.PI / 7, 0.5, 1.2);
    spot.position.set(0, 4.5, 0.6);
    spot.target = avatar;
    g.add(spot);

    // labels
    const plate = document.createElement("div");
    plate.className = "nameplate";
    plate.style.setProperty("--c", p.color);
    plate.innerHTML = `<span class="pill">${p.name}</span><span class="inspired">inspired by ${p.inspiredBy}</span><span class="score" hidden></span>`;
    const plateObj = new CSS2DObject(plate);
    plateObj.position.set(0, 0.15, 0.6);
    g.add(plateObj);

    const bubble = document.createElement("div");
    bubble.className = "bubble hide";
    bubble.style.setProperty("--c", p.color);
    const bubbleObj = new CSS2DObject(bubble);
    // anchor by the bubble's bottom edge so it sits above the portrait, not over it
    bubbleObj.center.set(0.5, 1);
    bubbleObj.position.set(0, 2.6, 0);
    g.add(bubbleObj);

    scene.add(g);
    seats[p.id] = { group: g, avatar, head, spot, ringFill, bubble, plate, speaking: false, score: 0, shown: 0 };
  });

  // ---------- animation ----------
  const timer = new THREE.Timer();
  let chairActive = false;
  let globeTarget = 1;

  function resize() {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 520;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    labels.setSize(w, h);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  renderer.setAnimationLoop((now) => {
    timer.update(now);
    const t = timer.getElapsed();
    controls.update();

    globeMesh.rotation.y += 0.004;
    globeMesh.rotation.x = Math.sin(t * 0.3) * 0.2;
    globe.position.y = 2.3 + Math.sin(t * 1.2) * 0.06;
    const pulse = chairActive ? 1 + Math.sin(t * 6) * 0.08 : 1;
    globe.scale.setScalar(THREE.MathUtils.lerp(globe.scale.x, globeTarget * pulse, 0.08));

    for (const s of Object.values(seats)) {
      const bob = s.speaking ? Math.sin(t * 9) * 0.03 : Math.sin(t * 1.4 + s.group.position.x) * 0.01;
      s.avatar.position.y = bob;
      s.head.material.rotation = s.speaking ? Math.sin(t * 3) * 0.12 : 0;
      s.spot.intensity = THREE.MathUtils.lerp(s.spot.intensity, s.speaking ? 40 : 0, 0.1);
      // animate the score ring towards its target
      if (Math.abs(s.shown - s.score) > 0.001) {
        s.shown = THREE.MathUtils.lerp(s.shown, s.score, 0.06);
        s.ringFill.geometry.dispose();
        s.ringFill.geometry = new THREE.RingGeometry(0.75, 0.85, 64, 1, Math.PI / 2, Math.max(0.0001, (s.shown / 10) * Math.PI * 2));
      }
    }
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  // ---------- public API ----------
  const tail = (text, n = 110) => {
    const clean = text.replace(/^(ROAST|STANCE|TARGET|TAKE|FIXES|SCORE|ONE-LINER):\s*/gim, "").replace(/\s+/g, " ").trim();
    return clean.length > n ? "…" + clean.slice(-n) : clean;
  };

  return {
    setSpeaking(id, on) {
      if (id === "chair") {
        chairActive = on;
        globeMat.opacity = on ? 0.9 : 0.55;
        return;
      }
      const s = seats[id];
      if (s) s.speaking = on;
    },
    setBubble(id, text, stance) {
      const s = seats[id];
      if (!s) return;
      if (!text) {
        s.bubble.classList.add("hide");
        return;
      }
      s.bubble.classList.remove("hide");
      s.bubble.innerHTML = (stance ? `<span class="stance">${stance}</span>` : "") + escapeHtml(tail(text));
    },
    setScore(id, score) {
      const s = seats[id];
      if (!s || score == null) return;
      s.score = score;
      const el = s.plate.querySelector(".score");
      el.hidden = false;
      el.textContent = `${score}/10`;
    },
    setVerdict(score) {
      const color = score >= 70 ? 0x7bd88f : score >= 45 ? 0xf5b942 : 0xff6b5b;
      globeMat.color.setHex(color);
      coreMat.color.setHex(color);
      globeTarget = 1.25;
      const el = chairScoreEl;
      el.style.display = "";
      el.style.setProperty("--c", "#" + new THREE.Color(color).getHexString());
      el.textContent = `${score}/100`;
      controls.autoRotateSpeed = 0.9;
    },
    reset() {
      for (const [id, s] of Object.entries(seats)) {
        s.speaking = false;
        s.score = 0;
        s.plate.querySelector(".score").hidden = true;
        this.setBubble(id, "");
      }
      chairActive = false;
      globeTarget = 1;
      globeMat.color.setHex(0x9aa7ff);
      coreMat.color.setHex(0x9aa7ff);
      chairScoreEl.style.display = "none";
      controls.autoRotateSpeed = 0.35;
    },
  };
}

// Draws the advisor portrait into a round medallion with a ring in their colour.
function portraitTexture(id, ringColor) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext("2d");
    const r = size / 2 - 14;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, size / 2 - r, size / 2 - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r + 6, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = ringColor;
    ctx.stroke();
    tex.needsUpdate = true;
  };
  img.src = `/avatars/${id}.webp`;
  return tex;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
