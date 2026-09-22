const GAS_API_URL =
  "https://script.google.com/macros/s/AKfycbz3EB83iold7NGWXmTUJ1jRYGYVG_jXfdCUvOofPOb859O2KizAgdU6C3fA9XBnN9s/exec";
const CACHE_KEY_CATALOGOS = "app_catalogos_cache";
const CACHE_KEY_RETRABAJOS = "piezas_retrabajo_pendientes";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const TIMEOUT_INACTIVIDAD_MS = 60 * 60 * 1000;

const MAPA_IMAGENES_CAT3 = {
  "Se sube de arriba y abajo":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/sube-sube.gif",
  "Se sube de arriba y se baja de abajo":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/sube-baja.gif",
  "Se baja de arriba y de abajo":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/baja-baja.gif",
  "Se baja de arriba y se sube de abajo":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/baja-sube.gif",
  "Solo se sube de abajo":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/normal-sube.gif",
  "Solo se baja de abajo":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/normal-baja.gif",
  "Solo se sube de arriba":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/sube-normal.gif",
  "Solo se baja de arriba":
    "https://raw.githubusercontent.com/fgbonilla99-oss/fgbonilla99-oss.github.io/refs/heads/main/baja-normal.gif",
};

let catalogos = {
  productos: [],
  categorias: [],
  secciones: [],
  problemas: [],
  preguntas: [],
  codigos: [],
  tbRetrabajos: [],
  usuarios: [],
};
let sesionActiva = null;
let creandoNuevoPin = false;

// Estado del Flujo de Inspección
let currentPiece = { shopfloor_id: "", id_model: "" };
let selectedCategories = [];
let currentSectionId = null;
let retrabajoData = { id_problem: "", id_code: "", otro_detalle: "" };
let contencionesQueue = [];
let contencionesResponses = {};

let listaOpcionesRetrabajoTemporal = [];

window.addEventListener("DOMContentLoaded", () => {
  cargarCatalogos();
  verificarSesion();
  configurarEventosInactividad();
});

function showLoading(show) {
  document.getElementById("modal-loading").classList.toggle("active", show);
}

/**
 * 1. LOGIN CON SELECTOR DE ROL
 */
function cambiarModoLogin(modo) {
  const tabOp = document.getElementById("tab-op");
  const tabAdm = document.getElementById("tab-adm");
  const formOp = document.getElementById("form-login-op");
  const formAdm = document.getElementById("form-login-adm");

  if (modo === "OP") {
    tabOp.classList.add("active");
    tabAdm.classList.remove("active");
    formOp.style.display = "block";
    formAdm.style.display = "none";
    cancelarCrearPin();
  } else {
    tabAdm.classList.add("active");
    tabOp.classList.remove("active");
    formOp.style.display = "none";
    formAdm.style.display = "block";
  }
}

function cancelarCrearPin() {
  creandoNuevoPin = false;
  document.getElementById("lbl-admin-pin").textContent = "PIN de Acceso (6 dígitos):";
  document.getElementById("grp-admin-pin-confirm").style.display = "none";
  document.getElementById("admin-pin-confirm").required = false;
  document.getElementById("btn-admin-submit").textContent = "Ingresar";
  document.getElementById("btn-admin-cancel-create").style.display = "none";
  document.getElementById("admin-pin").value = "";
  document.getElementById("admin-pin-confirm").value = "";
}

/**
 * 2. SESIÓN OPERADOR
 */
function verificarSesion() {
  const raw = localStorage.getItem("app_session");
  if (!raw) return mostrarLogin();

  const session = JSON.parse(raw);
  const ahora = Date.now();
  if (ahora - session.lastActivity > TIMEOUT_INACTIVIDAD_MS) {
    intentarCerrarSesion(true);
    return;
  }

  sesionActiva = session;
  actualizarActividad();
  mostrarWorkspace();
}

function actualizarActividad() {
  if (!sesionActiva) return;
  sesionActiva.lastActivity = Date.now();
  localStorage.setItem("app_session", JSON.stringify(sesionActiva));
}

function configurarEventosInactividad() {
  ["mousedown", "mousemove", "keydown", "touchstart", "scroll"].forEach((evt) => {
    document.addEventListener(evt, () => actualizarActividad(), { passive: true });
  });

  setInterval(() => {
    if (sesionActiva) {
      const transcurrido = Date.now() - sesionActiva.lastActivity;
      const restanteMin = Math.max(0, Math.ceil((TIMEOUT_INACTIVIDAD_MS - transcurrido) / 60000));
      document.getElementById("lbl-timer").textContent = `Inactividad: ${restanteMin}m`;
      if (transcurrido > TIMEOUT_INACTIVIDAD_MS) {
        intentarCerrarSesion(true);
      }
    }
  }, 60000);
}

function intentarCerrarSesion(porInactividad = false) {
  const pendientes = JSON.parse(localStorage.getItem(CACHE_KEY_RETRABAJOS) || "{}");
  const countPendientes = Object.keys(pendientes).length;

  if (countPendientes > 0) {
    const confirmacion = confirm(
      `Tienes ${countPendientes} pieza(s) con estatus de RECHAZO pendiente.\n\n¿Confirmas que estas piezas NO fueron retrabajadas en el turno?\n\nAl aceptar, se limpiará el historial local.`
    );
    if (!confirmacion && !porInactividad) return;
    localStorage.removeItem(CACHE_KEY_RETRABAJOS);
  }

  cerrarSesionEfectiva();
  if (porInactividad) alert("La sesión ha expirado por inactividad.");
}

function cerrarSesionEfectiva() {
  sesionActiva = null;
  localStorage.removeItem("app_session");
  document.getElementById("app-header").style.display = "none";
  document.getElementById("view-workspace").classList.remove("active");
  document.getElementById("view-admin").classList.remove("active");
  document.getElementById("view-login").classList.add("active");
  document.getElementById("form-login-op").reset();
  cambiarModoLogin("OP");
}

function cerrarSesionAdmin() {
  document.getElementById("view-admin").classList.remove("active");
  document.getElementById("view-login").classList.add("active");
  document.getElementById("form-login-adm").reset();
  cancelarCrearPin();
  cambiarModoLogin("OP");
}

function mostrarLogin() {
  document.getElementById("app-header").style.display = "none";
  document.getElementById("view-workspace").classList.remove("active");
  document.getElementById("view-admin").classList.remove("active");
  document.getElementById("view-login").classList.add("active");
}

function mostrarWorkspace() {
  document.getElementById("view-login").classList.remove("active");
  document.getElementById("view-admin").classList.remove("active");
  document.getElementById("view-workspace").classList.add("active");
  document.getElementById("app-header").style.display = "flex";

  document.getElementById("lbl-operador").textContent = sesionActiva.employee_id;
  document.getElementById("lbl-estacion").textContent = sesionActiva.station_id;

  abrirModalPieza();
}

document.getElementById("form-login-op").addEventListener("submit", (e) => {
  e.preventDefault();
  const empInput = document.getElementById("login-emp").value.trim();
  const estInput = document.getElementById("login-est").value.trim();

  // Validación Empleado: Inicia en 0, termina en A/a, 7 caracteres
  const empRegex = /^0[a-zA-Z0-9]{5}[aA]$/;
  if (!empRegex.test(empInput)) {
    alert("Número de empleado inválido.\n\nRequisitos:\n• Debes escanear tu gafete (7 caracteres, inicia con 0 y termina con A).");
    document.getElementById("login-emp").focus();
    return;
  }

  // Validación Estación: 2 guiones bajos separando bloques (ej. WOD_FIN_01, ROL_FIN_01)
  const estUpper = estInput.toUpperCase();
  const countGuiones = (estInput.match(/_/g) || []).length;
  const estRegex = /^[A-Z0-9]+_[A-Z0-9]+_[A-Z0-9]+$/;

  if (!estRegex.test(estUpper) || countGuiones !== 2) {
    alert("Estación de trabajo inválida.\n\nRequisitos:\n• Formato requerido: PREFIJO_SECCION_NUMERO (Ej. WOD_FIN_01)");
    document.getElementById("login-est").focus();
    return;
  }

  sesionActiva = {
    employee_id: empInput.toUpperCase(),
    station_id: estUpper,
    lastActivity: Date.now(),
  };
  localStorage.setItem("app_session", JSON.stringify(sesionActiva));
  mostrarWorkspace();
});

/**
 * 3. LOGIN ADMIN
 */
document.getElementById("form-login-adm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("admin-email").value.trim();
  const pin = document.getElementById("admin-pin").value.trim();

  if (pin.length !== 6 || isNaN(pin)) return alert("El PIN debe tener 6 dígitos numéricos.");

  if (creandoNuevoPin) {
    const pinConfirm = document.getElementById("admin-pin-confirm").value.trim();
    if (pin !== pinConfirm) return alert("Los PIN no coinciden.");

    showLoading(true);
    try {
      const res = await (
        await fetch(GAS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "registrarPinAdmin", email: email, pin: pin }),
        })
      ).json();

      if (res.success) {
        alert("✓ PIN generado exitosamente.");
        abrirPanelAdmin();
      } else {
        alert("Error: " + res.message);
      }
    } catch (err) {
      alert("Error de conexión: " + err.message);
    } finally {
      showLoading(false);
    }
    return;
  }

  showLoading(true);
  try {
    const res = await (
      await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "autenticarAdmin", email: email, pin: pin }),
      })
    ).json();

    if (res.success) {
      abrirPanelAdmin();
    } else if (res.needsNewPin) {
      alert(res.message);
      creandoNuevoPin = true;
      document.getElementById("lbl-admin-pin").textContent = "Crear Nuevo PIN (6 dígitos):";
      document.getElementById("grp-admin-pin-confirm").style.display = "block";
      document.getElementById("admin-pin-confirm").required = true;
      document.getElementById("btn-admin-submit").textContent = "Guardar PIN y Acceder";
      document.getElementById("btn-admin-cancel-create").style.display = "block";
      document.getElementById("admin-pin").value = "";
      document.getElementById("admin-pin-confirm").value = "";
    } else {
      alert(res.message);
    }
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    showLoading(false);
  }
});

function abrirPanelAdmin() {
  document.getElementById("view-login").classList.remove("active");
  document.getElementById("view-admin").classList.add("active");
  document.getElementById("app-header").style.display = "none";
  renderizarTablaCRUD();
}

/**
 * 4. CARGA DE CATÁLOGOS
 */
async function cargarCatalogos(forzar = false) {
  if (!forzar) {
    const raw = localStorage.getItem(CACHE_KEY_CATALOGOS);
    if (raw) {
      try {
        const cache = JSON.parse(raw);
        if (Date.now() - cache.timestamp < CACHE_TTL_MS) {
          catalogos = cache.data;
          poblarSelects();
          return;
        }
      } catch (e) {}
    }
  }

  try {
    showLoading(true);
    const res = await (await fetch(`${GAS_API_URL}?action=getCatalogos`)).json();
    if (res.success) {
      catalogos = res.data;
      localStorage.setItem(
        CACHE_KEY_CATALOGOS,
        JSON.stringify({ timestamp: Date.now(), data: catalogos })
      );
      poblarSelects();
      if (forzar) {
        alert("✓ Catálogos actualizados.");
        renderizarTablaCRUD();
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    showLoading(false);
  }
}

function poblarSelects() {
  const selModel = document.getElementById("select-modelo");
  selModel.innerHTML = '<option value="">-- Selecciona Modelo --</option>';
  (catalogos.productos || []).forEach(
    (p) => (selModel.innerHTML += `<option value="${p.id_product}">${p.text_product}</option>`)
  );

  const selCatFiltro = document.getElementById("filtro-cat");
  selCatFiltro.innerHTML = '<option value="ALL">Todas</option>';
  (catalogos.categorias || []).forEach(
    (c) => (selCatFiltro.innerHTML += `<option value="${c.id_category}">${c.name_category}</option>`)
  );
}

/**
 * 5. MANTENIMIENTO CRUD (ADMINISTRACIÓN)
 */
function getProblemName(idProb) {
  const prob = (catalogos.problemas || []).find(
    (p) => p.id_problem.toString() === (idProb || "").toString()
  );
  return prob ? prob.type_problem : idProb || "N/A";
}

function getProblemNamesFromPipe(pipeStr) {
  if (!pipeStr || pipeStr.toString().trim() === "0") return "No Aplica";
  const ids = pipeStr.toString().split("|").map((s) => s.trim());
  return ids.map((id) => getProblemName(id)).join(", ");
}

function obtenerDataTablaActiva(sheetName) {
  if (sheetName === "tbProductos") return catalogos.productos || [];
  if (sheetName === "tbCategorias") return catalogos.categorias || [];
  if (sheetName === "tbProblemas") return catalogos.problemas || [];
  if (sheetName === "tbCodigos") return catalogos.codigos || [];
  if (sheetName === "tbSecciones") return catalogos.secciones || [];
  if (sheetName === "tbRetrabajos") return catalogos.tbRetrabajos || catalogos.retrabajos || [];
  if (sheetName === "tbUsuarios") return catalogos.usuarios || [];
  return [];
}

function renderizarTablaCRUD() {
  const sheetName = document.getElementById("select-crud-table").value;
  const tableElem = document.getElementById("tabla-crud-render");
  const datos = obtenerDataTablaActiva(sheetName);

  let thead = "<thead><tr>";
  let tbody = "<tbody>";

  if (sheetName === "tbProductos") {
    thead += '<th>Modelo / Producto</th><th style="text-align:center;">Acción</th></tr></thead>';
    if (datos.length === 0)
      tbody += '<tr><td colspan="2" style="text-align:center; color:var(--text-muted);">Sin modelos registrados.</td></tr>';
    datos.forEach((row) => {
      tbody += `<tr>
          <td><strong>${row.text_product}</strong></td>
          <td style="text-align:center;"><button type="button" class="btn-sm-del" onclick="eliminarFilaCRUD('${sheetName}', '${row.id_product}')">Eliminar</button></td>
        </tr>`;
    });
  } else if (sheetName === "tbCodigos") {
    thead += '<th>Defecto</th><th>Sección</th><th>Tipo de Problema</th><th style="text-align:center;">Acción</th></tr></thead>';
    if (datos.length === 0)
      tbody += '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Sin defectos registrados.</td></tr>';
    datos.forEach((row) => {
      const sec = (catalogos.secciones || []).find(
        (s) => s.id_section.toString() === (row.id_section || "").toString()
      );
      const secNombre = sec ? sec.name_section : row.id_section || "N/A";

      tbody += `<tr>
          <td><strong>${row.text_code}</strong></td>
          <td>${secNombre}</td>
          <td>${getProblemName(row.id_problem)}</td>
          <td style="text-align:center;"><button type="button" class="btn-sm-del" onclick="eliminarFilaCRUD('${sheetName}', '${row.id_code}')">Eliminar</button></td>
        </tr>`;
    });
  } else if (sheetName === "tbRetrabajos") {
    thead += '<th>Acción de Reparación</th><th>Problema</th><th>Tipo de Respuesta</th><th>Opciones</th><th style="text-align:center;">Acción</th></tr></thead>';
    if (datos.length === 0)
      tbody += '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">Sin acciones registradas.</td></tr>';
    datos.forEach((row) => {
      const typeLabel =
        row.answer_type === "NUMBER"
          ? "Número"
          : row.answer_type === "CHOOSE"
          ? "Lista Desplegable"
          : "No Aplica";
      tbody += `<tr>
          <td><strong>${row.text_rework}</strong></td>
          <td>${getProblemName(row.id_problem)}</td>
          <td>${typeLabel}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${row.options_rework || "N/A"}</td>
          <td style="text-align:center;"><button type="button" class="btn-sm-del" onclick="eliminarFilaCRUD('${sheetName}', '${row.id_rework}')">Eliminar</button></td>
        </tr>`;
    });
  } else if (sheetName === "tbCategorias") {
    thead += '<th>Categoría</th><th>Descripción / Validación</th><th style="text-align:center;">Acción</th></tr></thead>';
    if (datos.length === 0)
      tbody += '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Sin categorías registradas.</td></tr>';
    datos.forEach((row) => {
      tbody += `<tr>
          <td><strong>${row.name_category}</strong></td>
          <td>${row.question_category || "N/A"}</td>
          <td style="text-align:center;"><button type="button" class="btn-sm-del" onclick="eliminarFilaCRUD('${sheetName}', '${row.id_category}')">Eliminar</button></td>
        </tr>`;
    });
  } else if (sheetName === "tbSecciones") {
    thead += '<th>Componente</th><th>Problemas Aplicables</th><th style="text-align:center;">Acción</th></tr></thead>';
    if (datos.length === 0)
      tbody += '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Sin secciones registradas.</td></tr>';
    datos.forEach((row) => {
      tbody += `<tr>
          <td><strong>${row.name_section}</strong></td>
          <td>${getProblemNamesFromPipe(row.apply_problem)}</td>
          <td style="text-align:center;"><button type="button" class="btn-sm-del" onclick="eliminarFilaCRUD('${sheetName}', '${row.id_section}')">Eliminar</button></td>
        </tr>`;
    });
  } else if (sheetName === "tbUsuarios") {
    thead += '<th>Nombre</th><th>Correo</th><th>Rol</th><th style="text-align:center;">Acción</th></tr></thead>';
    if (datos.length === 0)
      tbody += '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Sin usuarios registrados.</td></tr>';
    datos.forEach((row) => {
      tbody += `<tr>
          <td><strong>${row.name_user}</strong></td>
          <td>${row.email_user}</td>
          <td>${row.rol_user}</td>
          <td style="text-align:center;"><button type="button" class="btn-sm-del" onclick="eliminarFilaCRUD('${sheetName}', '${row.id_user}')">Eliminar</button></td>
        </tr>`;
    });
  }

  tbody += "</tbody>";
  tableElem.innerHTML = thead + tbody;
}

function abrirModalNuevaFila() {
  const sheetName = document.getElementById("select-crud-table").value;
  const container = document.getElementById("container-crud-inputs");
  const modalTitle = document.getElementById("lbl-crud-modal-title");

  listaOpcionesRetrabajoTemporal = [];
  container.innerHTML = "";

  if (sheetName === "tbProductos") {
    modalTitle.textContent = "Agregar Nuevo Modelo de Producción";
    container.innerHTML = `
        <div class="form-group">
          <label>Nombre del Modelo:</label>
          <input type="text" id="crud-text_product" required placeholder="Ej. Roller Screen 3% Beige" autocomplete="off">
        </div>
      `;
  } else if (sheetName === "tbCodigos") {
    modalTitle.textContent = "Agregar Nuevo Código de Defecto";

    let optionsSec = '<option value="">-- Selecciona Sección --</option>';
    (catalogos.secciones || []).forEach((s) => {
      optionsSec += `<option value="${s.id_section}">${s.name_section}</option>`;
    });

    let checksProb = "";
    (catalogos.problemas || []).forEach((p) => {
      checksProb += `
          <label class="checkbox-label" style="padding: 6px 10px; margin-bottom: 4px;">
            <input type="checkbox" name="crud-codigo-prob" value="${p.id_problem}">
            ${p.type_problem}
          </label>
        `;
    });

    container.innerHTML = `
        <div class="form-group">
          <label>Componente / Sección:</label>
          <select id="crud-id_section" required>
            ${optionsSec}
          </select>
        </div>
        <div class="form-group">
          <label>Descripción del Defecto:</label>
          <input type="text" id="crud-text_code" required placeholder="Ej. Tela desalineada / caída rápida" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Selecciona a qué tipo(s) de problema aplica:</label>
          ${checksProb}
        </div>
      `;
  } else if (sheetName === "tbRetrabajos") {
    modalTitle.textContent = "Agregar Acción de Retrabajo";
    let optionsProb = '<option value="">-- Selecciona el problema al que entra --</option>';
    (catalogos.problemas || []).forEach((p) => {
      optionsProb += `<option value="${p.id_problem}">${p.type_problem}</option>`;
    });

    container.innerHTML = `
        <div class="form-group">
          <label>Acción de Reparación:</label>
          <input type="text" id="crud-text_rework" required placeholder="Ej. Cambiar a motor específico" autocomplete="off">
        </div>
        <div class="form-group">
          <label>¿A qué problema pertenece?</label>
          <select id="crud-id_problem_rework" required>
            ${optionsProb}
          </select>
        </div>
        <div class="form-group">
          <label>Tipo de Respuesta Requerida:</label>
          <select id="crud-answer_type" onchange="toggleCrudOptionsRework(this.value)" required>
            <option value="N/A">No requiere dato extra (Solo registrar acción)</option>
            <option value="NUMBER">Número (ej. cantidad de vueltas o pesas)</option>
            <option value="CHOOSE">Lista Desplegable (ej. números de parte de motores)</option>
          </select>
        </div>
        <div class="form-group" id="grp-crud-options_rework" style="display: none;">
          <label>Agregar opciones para la lista:</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="input-nueva-opcion-tag" placeholder="Ej. Motor 1043755" autocomplete="off">
            <button type="button" class="btn" style="width: auto; padding: 8px 16px; margin-top: 0;" onclick="agregarOpcionTag()">+ Agregar</button>
          </div>
          <div class="tags-container" id="tags-opciones-container"></div>
        </div>
      `;
  } else if (sheetName === "tbCategorias") {
    modalTitle.textContent = "Agregar Categoría de Registro";
    container.innerHTML = `
        <div class="form-group">
          <label>Nombre de la Categoría:</label>
          <input type="text" id="crud-name_category" required placeholder="Ej. CONTENCION 4" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Descripción / Pregunta General:</label>
          <input type="text" id="crud-question_category" placeholder="Ej. Checklist de embalaje" autocomplete="off">
        </div>
      `;
  } else if (sheetName === "tbSecciones") {
    modalTitle.textContent = "Agregar Componente de la Persiana";
    let checksProb = "";
    (catalogos.problemas || []).forEach((p) => {
      checksProb += `
          <label class="checkbox-label" style="padding: 6px 10px; margin-bottom: 4px;">
            <input type="checkbox" name="crud-sec-prob" value="${p.id_problem}">
            ${p.type_problem}
          </label>
        `;
    });

    container.innerHTML = `
        <div class="form-group">
          <label>Nombre del Componente / Sección:</label>
          <input type="text" id="crud-name_section" required placeholder="Ej. Soporte Intermedio" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Selecciona los tipos de problemas que aplican:</label>
          ${checksProb}
        </div>
      `;
  } else if (sheetName === "tbUsuarios") {
    modalTitle.textContent = "Agregar Usuario Administrador";
    container.innerHTML = `
        <div class="form-group">
          <label>Nombre Completo:</label>
          <input type="text" id="crud-name_user" required placeholder="Ej. Juan Pérez" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Correo Electrónico:</label>
          <input type="email" id="crud-email_user" required placeholder="juan.perez@empresa.com" autocomplete="off">
        </div>
        <div class="form-group">
          <label>Rol:</label>
          <select id="crud-rol_user">
            <option value="ADMIN">ADMIN (Acceso Total)</option>
            <option value="SUPERVISOR">SUPERVISOR</option>
          </select>
        </div>
      `;
  }

  document.getElementById("modal-crud-add").classList.add("active");
}

function toggleCrudOptionsRework(val) {
  const grp = document.getElementById("grp-crud-options_rework");
  if (val === "CHOOSE") {
    grp.style.display = "block";
  } else {
    grp.style.display = "none";
    listaOpcionesRetrabajoTemporal = [];
    renderizarTagsOpciones();
  }
}

function agregarOpcionTag() {
  const input = document.getElementById("input-nueva-opcion-tag");
  const val = input.value.trim();
  if (!val) return;
  if (listaOpcionesRetrabajoTemporal.includes(val)) {
    alert("Esta opción ya fue agregada.");
    return;
  }
  listaOpcionesRetrabajoTemporal.push(val);
  input.value = "";
  renderizarTagsOpciones();
  input.focus();
}

function removerOpcionTag(index) {
  listaOpcionesRetrabajoTemporal.splice(index, 1);
  renderizarTagsOpciones();
}

function renderizarTagsOpciones() {
  const cont = document.getElementById("tags-opciones-container");
  if (!cont) return;
  cont.innerHTML = "";
  listaOpcionesRetrabajoTemporal.forEach((op, idx) => {
    cont.innerHTML += `
        <div class="tag-item">
          <span>${op}</span>
          <span class="tag-item-remove" onclick="removerOpcionTag(${idx})">✕</span>
        </div>
      `;
  });
}

function cerrarModalNuevaFila() {
  document.getElementById("modal-crud-add").classList.remove("active");
}

document.getElementById("form-crud-add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sheetName = document.getElementById("select-crud-table").value;
  const datosActuales = obtenerDataTablaActiva(sheetName);
  let payloadEnvio = null;

  if (sheetName === "tbProductos") {
    const nombre = document.getElementById("crud-text_product").value.trim();
    const yaExiste = datosActuales.some(
      (p) => p.text_product.toString().trim().toUpperCase() === nombre.toUpperCase()
    );
    if (yaExiste) return alert(`El modelo "${nombre}" ya existe en la base de datos.`);

    const maxId = datosActuales.reduce((max, p) => Math.max(max, parseInt(p.id_product) || 0), 0);
    payloadEnvio = { id_product: (maxId + 1).toString(), text_product: nombre };
  } else if (sheetName === "tbCodigos") {
    const idSec = document.getElementById("crud-id_section").value;
    const defecto = document.getElementById("crud-text_code").value.trim();
    const checkedProbs = Array.from(
      document.querySelectorAll('input[name="crud-codigo-prob"]:checked')
    ).map((el) => el.value);

    if (!idSec) return alert("Selecciona la sección correspondiente.");
    if (checkedProbs.length === 0) return alert("Selecciona al menos un tipo de problema.");

    let maxId = datosActuales.reduce((max, c) => Math.max(max, parseInt(c.id_code) || 0), 0);
    const rowsToAdd = [];

    for (const idProb of checkedProbs) {
      const yaExiste = datosActuales.some(
        (c) =>
          c.text_code.toString().trim().toUpperCase() === defecto.toUpperCase() &&
          c.id_problem.toString() === idProb.toString() &&
          c.id_section.toString() === idSec.toString()
      );
      if (!yaExiste) {
        maxId++;
        rowsToAdd.push({ id_code: maxId.toString(), id_section: idSec, id_problem: idProb, text_code: defecto });
      }
    }

    if (rowsToAdd.length === 0) return alert("Este defecto ya está registrado para esa sección y problema(s).");
    payloadEnvio = rowsToAdd;
  } else if (sheetName === "tbRetrabajos") {
    const accion = document.getElementById("crud-text_rework").value.trim();
    const idProb = document.getElementById("crud-id_problem_rework").value;
    const ansType = document.getElementById("crud-answer_type").value;

    let optionsFinal = "N/A";
    if (ansType === "CHOOSE") {
      if (listaOpcionesRetrabajoTemporal.length === 0) return alert("Agrega al menos una opción.");
      optionsFinal = listaOpcionesRetrabajoTemporal.join(" | ");
    }

    const yaExiste = datosActuales.some(
      (r) =>
        r.text_rework.toString().trim().toUpperCase() === accion.toUpperCase() &&
        r.id_problem.toString() === idProb.toString()
    );
    if (yaExiste) return alert(`La acción "${accion}" ya está registrada para este problema.`);

    const maxId = datosActuales.reduce((max, r) => Math.max(max, parseInt(r.id_rework) || 0), 0);
    payloadEnvio = {
      id_rework: (maxId + 1).toString(),
      id_problem: idProb,
      text_rework: accion,
      answer_type: ansType,
      options_rework: optionsFinal,
    };
  } else if (sheetName === "tbCategorias") {
    const nombreCat = document.getElementById("crud-name_category").value.trim();
    const question = document.getElementById("crud-question_category").value.trim();
    const yaExiste = datosActuales.some(
      (c) => c.name_category.toString().trim().toUpperCase() === nombreCat.toUpperCase()
    );
    if (yaExiste) return alert(`La categoría "${nombreCat}" ya existe.`);

    const maxId = datosActuales.reduce((max, c) => Math.max(max, parseInt(c.id_category) || 0), 0);
    payloadEnvio = { id_category: (maxId + 1).toString(), name_category: nombreCat, question_category: question };
  } else if (sheetName === "tbSecciones") {
    const nombreSec = document.getElementById("crud-name_section").value.trim();
    const checked = Array.from(document.querySelectorAll('input[name="crud-sec-prob"]:checked')).map((el) => el.value);
    const applyStr = checked.length ? checked.join(" | ") : "0";

    const yaExiste = datosActuales.some(
      (s) => s.name_section.toString().trim().toUpperCase() === nombreSec.toUpperCase()
    );
    if (yaExiste) return alert(`La sección "${nombreSec}" ya existe.`);

    const maxId = datosActuales.reduce((max, s) => Math.max(max, parseInt(s.id_section) || 0), 0);
    payloadEnvio = { id_section: (maxId + 1).toString(), name_section: nombreSec, apply_problem: applyStr };
  } else if (sheetName === "tbUsuarios") {
    const nombreUser = document.getElementById("crud-name_user").value.trim();
    const email = document.getElementById("crud-email_user").value.trim().toLowerCase();
    const rol = document.getElementById("crud-rol_user").value;

    const yaExiste = datosActuales.some((u) => u.email_user.toString().trim().toLowerCase() === email);
    if (yaExiste) return alert(`El correo "${email}" ya está registrado.`);

    const maxId = datosActuales.reduce((max, u) => Math.max(max, parseInt(u.id_user) || 0), 0);
    payloadEnvio = { id_user: (maxId + 1).toString(), name_user: nombreUser, email_user: email, rol_user: rol, pass_user: "" };
  }

  showLoading(true);
  try {
    const res = await (
      await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "agregarFilaTabla", sheetName: sheetName, newRowObj: payloadEnvio }),
      })
    ).json();

    if (res.success) {
      // alert("✓ Guardado correctamente.");
      cerrarModalNuevaFila();
      e.target.reset();
      listaOpcionesRetrabajoTemporal = [];
      await cargarCatalogos(true);
    } else {
      alert("Error: " + res.message);
    }
  } catch (err) {
    alert("Error de conexión: " + err.message);
  } finally {
    showLoading(false);
  }
});

async function eliminarFilaCRUD(sheetName, idValue) {
  if (!confirm(`¿Estás seguro de eliminar este registro?`)) return;

  showLoading(true);
  try {
    const res = await (
      await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "eliminarFilaTabla", sheetName: sheetName, idValue: idValue }),
      })
    ).json();

    if (res.success) {
      alert("✓ Eliminado correctamente.");
      await cargarCatalogos(true);
    } else {
      alert("Error: " + res.message);
    }
  } catch (err) {
    alert("Error de conexión: " + err.message);
  } finally {
    showLoading(false);
  }
}

/**
 * =========================================================================
 * NUEVO FLUJO OPERATIVO UX
 * =========================================================================
 */

/**
 * PASO 1 y 6: Escanear Pieza y Alerta de Reincidencia
 */
function abrirModalPieza() {
  document.getElementById("input-shopfloor").value = "";
  document.getElementById("select-modelo").value = "";
  document.getElementById("modal-pieza").classList.add("active");
  document.getElementById("input-shopfloor").focus();
}

document.getElementById("form-pieza").addEventListener("submit", (e) => {
  e.preventDefault();
  const shopfloor = document.getElementById("input-shopfloor").value.trim();
  const model = document.getElementById("select-modelo").value;

  currentPiece.shopfloor_id = shopfloor;
  currentPiece.id_model = model;

  // PASO 6: Si existe registro previo en rechazo, desplegar pop-up
  const pendientes = JSON.parse(localStorage.getItem(CACHE_KEY_RETRABAJOS) || "{}");
  if (pendientes[shopfloor]) {
    document.getElementById("modal-pieza").classList.remove("active");
    document.getElementById("modal-retrabajo-previo").classList.add("active");
    return;
  }

  avanzarACategorias();
});

function confirmarNuevoDefecto() {
  document.getElementById("modal-retrabajo-previo").classList.remove("active");
  avanzarACategorias();
}

/**
 * PASO 2: Selección de Tipos de Registro (Categorías)
 */
function avanzarACategorias() {
  document.getElementById("lbl-shopfloor").textContent = currentPiece.shopfloor_id;
  const modelObj = (catalogos.productos || []).find((p) => p.id_product == currentPiece.id_model);
  document.getElementById("lbl-modelo").textContent = modelObj ? modelObj.text_product : currentPiece.id_model;

  document.getElementById("modal-pieza").classList.remove("active");
  abrirModalCategorias();
}

function abrirModalCategorias() {
  const container = document.getElementById("list-categorias");
  container.innerHTML = "";
  (catalogos.categorias || []).forEach((c) => {
    container.innerHTML += `
        <label class="checkbox-label">
          <input type="checkbox" name="cat-choice" value="${c.id_category}" data-name="${c.name_category}">
          ${c.name_category}
        </label>
      `;
  });
  document.getElementById("modal-categorias").classList.add("active");
}

document.getElementById("form-categorias").addEventListener("submit", (e) => {
  e.preventDefault();
  const checked = Array.from(document.querySelectorAll('input[name="cat-choice"]:checked'));
  if (!checked.length) return alert("Selecciona al menos una categoría.");

  selectedCategories = checked.map((el) => ({
    id: el.value,
    name: el.getAttribute("data-name"),
  }));

  document.getElementById("modal-categorias").classList.remove("active");
  // PASO 3: Queda activa la persiana en el workspace para seleccionar la sección afectada
});

/**
 * PASO 3: Selección de Sección en Persiana Técnica SVG
 */
document.querySelectorAll(".comp-zone").forEach((zone) => {
  zone.addEventListener("click", () => {
    if (selectedCategories.length === 0) {
      alert("Primero debes escanear la pieza y seleccionar las categorías.");
      return;
    }

    document.querySelectorAll(".comp-zone").forEach((z) => z.classList.remove("activo"));
    zone.classList.add("activo");
    currentSectionId = zone.getAttribute("data-id-section");

    // PASO 4: Se abren los cuestionarios / retrabajo según las categorías elegidas
    iniciarCuestionariosFlujo();
  });
});

/**
 * PASO 4: Formularios de Retrabajo y Preguntas Dinámicas
 */
function iniciarCuestionariosFlujo() {
  const tieneRetrabajo = selectedCategories.some((c) =>
    c.name.toString().toUpperCase().includes("RECHAZO")
  );
  contencionesQueue = selectedCategories.filter(
    (c) => !c.name.toString().toUpperCase().includes("RECHAZO")
  );
  contencionesResponses = {};

  if (tieneRetrabajo) {
    iniciarFlujoProblema();
  } else {
    procesarSiguienteContencion();
  }
}

function iniciarFlujoProblema() {
  const sectionObj = (catalogos.secciones || []).find(
    (s) => s.id_section.toString() === currentSectionId.toString()
  );
  const applyStr = sectionObj ? sectionObj.apply_problem.toString() : "0";

  if (applyStr.trim() === "0") {
    retrabajoData = { id_problem: "", id_code: "", otro_detalle: "" };
    return procesarSiguienteContencion();
  }

  const allowedIds = applyStr.split("|").map((s) => s.trim());
  const selProb = document.getElementById("select-problema");
  selProb.innerHTML = '<option value="">-- Selecciona Tipo de Problema --</option>';

  (catalogos.problemas || [])
    .filter((p) => allowedIds.includes(p.id_problem.toString()))
    .forEach((p) => {
      selProb.innerHTML += `<option value="${p.id_problem}">${p.type_problem}</option>`;
    });

  document.getElementById("select-codigo").disabled = true;
  document.getElementById("select-codigo").innerHTML = '<option value="">-- Selecciona primero el tipo --</option>';
  document.getElementById("group-otro-defecto").style.display = "none";
  document.getElementById("input-otro-defecto").value = "";

  document.getElementById("modal-problema").classList.add("active");
}

document.getElementById("select-problema").addEventListener("change", (e) => {
  const probId = e.target.value;
  const selCod = document.getElementById("select-codigo");
  document.getElementById("group-otro-defecto").style.display = "none";

  if (!probId) {
    selCod.disabled = true;
    return (selCod.innerHTML = '<option value="">-- Selecciona primero el tipo --</option>');
  }

  // Filtrado cruzado: id_problem + id_section
  const codigosFiltrados = (catalogos.codigos || []).filter((c) => {
    const matchProblem = c.id_problem && c.id_problem.toString().trim() === probId.toString().trim();
    const matchSection = c.id_section && c.id_section.toString().trim() === currentSectionId.toString().trim();
    return matchProblem && matchSection;
  });

  selCod.innerHTML = '<option value="">-- Selecciona Defecto --</option>';
  if (codigosFiltrados.length === 0) {
    selCod.innerHTML = '<option value="">No hay defectos para esta sección y problema</option>';
  } else {
    codigosFiltrados.forEach((c) => {
      selCod.innerHTML += `<option value="${c.id_code}">${c.text_code}</option>`;
    });
  }
  selCod.disabled = false;
});

document.getElementById("select-codigo").addEventListener("change", (e) => {
  const text = e.target.options[e.target.selectedIndex].text.toUpperCase();
  const groupOtro = document.getElementById("group-otro-defecto");
  const inputOtro = document.getElementById("input-otro-defecto");
  if (text.includes("OTRO")) {
    groupOtro.style.display = "block";
    inputOtro.required = true;
    inputOtro.focus();
  } else {
    groupOtro.style.display = "none";
    inputOtro.required = false;
    inputOtro.value = "";
  }
});

document.getElementById("form-problema").addEventListener("submit", (e) => {
  e.preventDefault();
  retrabajoData.id_problem = document.getElementById("select-problema").value;
  retrabajoData.id_code = document.getElementById("select-codigo").value;
  retrabajoData.otro_detalle = document.getElementById("input-otro-defecto").value.trim();

  document.getElementById("modal-problema").classList.remove("active");
  procesarSiguienteContencion();
});

function procesarSiguienteContencion() {
  if (contencionesQueue.length === 0) return enviarRegistrosFinales();

  const currentCat = contencionesQueue.shift();
  const esCategoriaTres = currentCat.id.toString() === "3";
  const preguntas = (catalogos.preguntas || []).filter(
    (q) => q.id_category.toString() === currentCat.id.toString()
  );

  if (!preguntas.length) return procesarSiguienteContencion();

  document.getElementById("lbl-contencion-title").textContent = `Validación: ${currentCat.name}`;
  const container = document.getElementById("container-preguntas-dinamicas");
  container.innerHTML = "";

  const boxVisual = document.getElementById("box-visual-aid");
  const imgVisual = document.getElementById("img-visual-reference");
  boxVisual.style.display = "none";
  imgVisual.src = "";

  const linkedIds = preguntas
    .map((q) => (q.linked_question ? q.linked_question.toString().trim() : ""))
    .filter((id) => id !== "");

  preguntas.forEach((q) => {
    const qId = q.id_question.toString().trim();
    const esHija = linkedIds.includes(qId);
    const tipo = (q.type_question || "TEXT").toString().trim().toUpperCase();

    let inputHtml = "";
    if (tipo === "CHOOSE") {
      const opts = (q.options_question || "SI|NO").split("|");
      inputHtml = `
          <select data-qid="${qId}" 
                  data-linked="${q.linked_question || ""}" 
                  data-trigger="${q.trigger_question || ""}" 
                  data-is-cat3="${esCategoriaTres}"
                  ${esHija ? "" : "required"}>
            <option value="">-- Selecciona --</option>
            ${opts.map((o) => `<option value="${o.trim()}">${o.trim()}</option>`).join("")}
          </select>`;
    } else if (tipo === "NUMBER") {
      inputHtml = `
          <input type="number" step="any" 
                 data-qid="${qId}" 
                 data-linked="${q.linked_question || ""}" 
                 data-trigger="${q.trigger_question || ""}" 
                 placeholder="Valor numérico" 
                 ${esHija ? "" : "required"}>`;
    } else {
      inputHtml = `
          <input type="text" 
                 data-qid="${qId}" 
                 data-linked="${q.linked_question || ""}" 
                 data-trigger="${q.trigger_question || ""}" 
                 placeholder="Escribe tu respuesta..." 
                 ${esHija ? "" : "required"}>`;
    }

    container.innerHTML += `
        <div class="form-group" id="grp-q-${qId}" style="${esHija ? "display: none;" : ""}">
          <label>${q.text_question}</label>
          ${inputHtml}
        </div>
      `;
  });

  container.querySelectorAll("[data-qid]").forEach((elem) => {
    elem.addEventListener("change", (e) => {
      evaluarTriggers(container);
      if (e.target.getAttribute("data-is-cat3") === "true") {
        const val = e.target.value.trim();
        if (MAPA_IMAGENES_CAT3[val]) {
          imgVisual.src = MAPA_IMAGENES_CAT3[val];
          boxVisual.style.display = "flex";
        } else {
          boxVisual.style.display = "none";
        }
      }
    });
    elem.addEventListener("input", () => evaluarTriggers(container));
  });

  document.getElementById("modal-preguntas").classList.add("active");
}

function evaluarTriggers(container) {
  container.querySelectorAll("[data-linked]").forEach((parentInput) => {
    const linkedId = (parentInput.getAttribute("data-linked") || "").trim();
    const triggerVal = (parentInput.getAttribute("data-trigger") || "").trim();
    if (!linkedId) return;

    const childGroup = document.getElementById(`grp-q-${linkedId}`);
    const childInput = childGroup ? childGroup.querySelector("[data-qid]") : null;
    if (!childGroup || !childInput) return;

    const valorPadre = parentInput.value.trim();
    if (valorPadre !== "" && valorPadre.toUpperCase() === triggerVal.toUpperCase()) {
      childGroup.style.display = "block";
      childInput.required = true;
    } else {
      childGroup.style.display = "none";
      childInput.required = false;
      childInput.value = "";
    }
  });
}

document.getElementById("form-preguntas").addEventListener("submit", (e) => {
  e.preventDefault();
  document.querySelectorAll("#container-preguntas-dinamicas [data-qid]").forEach((inp) => {
    const qid = inp.getAttribute("data-qid");
    const grp = document.getElementById(`grp-q-${qid}`);
    if (grp && grp.style.display !== "none" && inp.value.trim() !== "") {
      contencionesResponses[qid] = inp.value.trim();
    }
  });
  document.getElementById("modal-preguntas").classList.remove("active");
  procesarSiguienteContencion();
});

/**
 * PASO 5: Guardado en Base de Datos y Persistencia de Retrabajo
 */
async function enviarRegistrosFinales() {
  const records = [];
  let huboRetrabajo = false;

  selectedCategories.forEach((cat) => {
    const isRetrabajo = cat.name.toString().toUpperCase().includes("RECHAZO");
    if (isRetrabajo) huboRetrabajo = true;

    records.push({
      id_category: cat.id,
      status_record: isRetrabajo ? "RECHAZO" : "ACTIVO",
      id_section: currentSectionId,
      id_problem: isRetrabajo ? retrabajoData.id_problem : "",
      id_code: isRetrabajo ? retrabajoData.id_code : "",
      response_json: isRetrabajo
        ? retrabajoData.otro_detalle
          ? { otro_detalle: retrabajoData.otro_detalle }
          : {}
        : contencionesResponses,
    });
  });

  const payload = {
    action: "guardarRegistros",
    employee_id: sesionActiva.employee_id,
    shopfloor_id: currentPiece.shopfloor_id,
    id_model: currentPiece.id_model,
    records: records,
  };

  try {
    showLoading(true);
    const res = await (
      await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      })
    ).json();

    if (res.success) {
      if (huboRetrabajo) {
        const pendientes = JSON.parse(localStorage.getItem(CACHE_KEY_RETRABAJOS) || "{}");
        pendientes[currentPiece.shopfloor_id] = {
          fecha: new Date().toISOString(),
          id_model: currentPiece.id_model,
          id_problem: retrabajoData.id_problem ? retrabajoData.id_problem.toString().trim() : "",
        };
        localStorage.setItem(CACHE_KEY_RETRABAJOS, JSON.stringify(pendientes));
      }

      alert(`✓ Registros guardados exitosamente (${res.count} fila(s)).`);
      reiniciarFlujo();
    } else {
      alert("Error al guardar: " + res.message);
    }
  } catch (err) {
    alert("Error de conexión: " + err.message);
  } finally {
    showLoading(false);
  }
}

function reiniciarFlujo() {
  document.querySelectorAll(".comp-zone").forEach((z) => z.classList.remove("activo"));
  currentSectionId = null;
  selectedCategories = [];
  retrabajoData = { id_problem: "", id_code: "", otro_detalle: "" };
  contencionesResponses = {};
  abrirModalPieza();
}

/**
 * Solución de Retrabajo (Pieza Reparada)
 */
function abrirModalSolucionRetrabajo() {
  document.getElementById("modal-retrabajo-previo").classList.remove("active");

  const pendientes = JSON.parse(localStorage.getItem(CACHE_KEY_RETRABAJOS) || "{}");
  const dataPieza = pendientes[currentPiece.shopfloor_id] || {};
  const idProbGuardado = dataPieza.id_problem ? dataPieza.id_problem.toString().trim() : "";

  const listaRetrabajos = catalogos.tbRetrabajos || catalogos.retrabajos || [];
  let opcionesFiltradas = listaRetrabajos.filter(
    (r) => r.id_problem && idProbGuardado && r.id_problem.toString().trim() === idProbGuardado
  );

  if (opcionesFiltradas.length === 0) opcionesFiltradas = listaRetrabajos;

  const selAccion = document.getElementById("select-accion-retrabajo");
  selAccion.innerHTML = '<option value="">-- Selecciona Acción Realizada --</option>';

  opcionesFiltradas.forEach((r) => {
    selAccion.innerHTML += `
        <option value="${r.id_rework}" 
                data-type="${(r.answer_type || "N/A").toString().trim()}" 
                data-opts="${(r.options_rework || "").toString().trim()}">
          ${r.text_rework}
        </option>`;
  });

  document.getElementById("grp-dinamico-retrabajo").style.display = "none";
  document.getElementById("container-input-retrabajo").innerHTML = "";
  document.getElementById("modal-solucion-retrabajo").classList.add("active");
}

document.getElementById("select-accion-retrabajo").addEventListener("change", (e) => {
  const opt = e.target.options[e.target.selectedIndex];
  const grp = document.getElementById("grp-dinamico-retrabajo");
  const container = document.getElementById("container-input-retrabajo");
  const lbl = document.getElementById("lbl-dinamico-retrabajo");

  if (!opt.value) {
    grp.style.display = "none";
    return;
  }

  const answerType = (opt.getAttribute("data-type") || "N/A").toUpperCase();
  const optionsRaw = opt.getAttribute("data-opts") || "";

  if (answerType === "NUMBER") {
    grp.style.display = "block";
    lbl.textContent = "Cantidad aplicada:";
    container.innerHTML = `<input type="number" step="any" id="input-solucion-valor" required placeholder="Ingresa cantidad">`;
  } else if (answerType === "CHOOSE") {
    grp.style.display = "block";
    lbl.textContent = "Selecciona Configuración / Opción:";
    const arrOpts = optionsRaw.split("|").map((s) => s.trim()).filter((s) => s !== "");
    container.innerHTML = `
        <select id="input-solucion-valor" required>
          <option value="">-- Selecciona Opción --</option>
          ${arrOpts.map((o) => `<option value="${o}">${o}</option>`).join("")}
        </select>`;
  } else {
    grp.style.display = "none";
    container.innerHTML = "";
  }
});

document.getElementById("form-solucion-retrabajo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const selAccion = document.getElementById("select-accion-retrabajo");
  const textoAccion = selAccion.options[selAccion.selectedIndex].text;
  const inputVal = document.getElementById("input-solucion-valor");
  const valorAplicado = inputVal ? inputVal.value : "N/A";

  const solucionPayload = {
    accion_reparacion: textoAccion,
    detalle_aplicado: valorAplicado,
    reparado_por: sesionActiva.employee_id,
    timestamp_arreglo: new Date().toISOString(),
  };

  showLoading(true);
  try {
    const payload = {
      action: "actualizarEstatusArreglado",
      employee_id: sesionActiva.employee_id,
      shopfloor_id: currentPiece.shopfloor_id,
      id_model: currentPiece.id_model,
      rework_solution: solucionPayload,
    };

    const res = await (
      await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      })
    ).json();

    if (res.success) {
      const pendientes = JSON.parse(localStorage.getItem(CACHE_KEY_RETRABAJOS) || "{}");
      delete pendientes[currentPiece.shopfloor_id];
      localStorage.setItem(CACHE_KEY_RETRABAJOS, JSON.stringify(pendientes));

      document.getElementById("modal-solucion-retrabajo").classList.remove("active");
      alert("✓ Retrabajo completado y registrado como ARREGLADO.");
      reiniciarFlujo();
    } else {
      alert("Error: " + res.message);
    }
  } catch (err) {
    alert("Error de conexión: " + err.message);
  } finally {
    showLoading(false);
  }
});

/**
 * EXPORTAR CSV
 */
async function descargarCSV() {
  const payload = {
    action: "exportarCSV",
    filtros: {
      fechaInicio: document.getElementById("filtro-desde").value,
      fechaFin: document.getElementById("filtro-hasta").value,
      id_category: document.getElementById("filtro-cat").value,
    },
  };

  try {
    showLoading(true);
    const res = await (
      await fetch(GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      })
    ).json();

    if (res.success) {
      const blob = new Blob([res.csvData], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", res.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert(res.message);
    }
  } catch (err) {
    alert("Error al exportar: " + err.message);
  } finally {
    showLoading(false);
  }
}
