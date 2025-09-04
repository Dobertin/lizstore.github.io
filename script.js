// =================================
//    TIENDA DE PRODUCTOS - JS
// =================================

// 🔧 Configuración Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, limit, startAfter, endBefore, getDocs } 
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC_QWs7nybX_NDTW51UvAgSXV4kmIagw2Q",
  authDomain: "lizaventas-267bb.firebaseapp.com",
  projectId: "lizaventas-267bb",
  storageBucket: "lizaventas-267bb.firebasestorage.app",
  messagingSenderId: "622337953195",
  appId: "1:622337953195:web:e2ea054eb6d3d9b4c9d6ee",
  measurementId: "G-LKESG2YXZC"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// 📊 Variables globales
const PRODUCTOS_POR_PAGINA = 8;
let ultimoDoc = null;
let primerDoc = null;
let stackDocs = [];
let paginaActual = 1;
let totalProductosMostrados = 0;

// 📱 Elementos del DOM
const elementos = {
  productos: document.getElementById("productos"),
  loading: document.getElementById("loading"),
  noProductos: document.getElementById("noProductos"),
  search: document.getElementById("search"),
  categoria: document.getElementById("categoria"),
  marca: document.getElementById("marca"),
  genero: document.getElementById("genero"),
  orden: document.getElementById("orden"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  clearFilters: document.getElementById("clearFilters"),
  paginaActual: document.getElementById("paginaActual"),
  totalProductos: document.getElementById("totalProductos")
};

// =================================
//        FUNCIONES PRINCIPALES
// =================================

/**
 * 🔍 Construir consulta Firestore con filtros
 * @param {string} direccion - Dirección de paginación ('next' o 'prev')
 * @returns {Query} Consulta de Firestore
 */
function construirQuery(direccion = "next") {
  const filtros = obtenerFiltros();
  let query = db.collection("productos");

  // Aplicar filtros exactos
  if (filtros.categoria) {
    query = query.where("categoriaNombre", "==", filtros.categoria);
  }
  if (filtros.marca) {
    query = query.where("marcaNombre", "==", filtros.marca);
  }
  if (filtros.genero) {
    query = query.where("genero", "==", filtros.genero);
  }

  // Ordenamiento
  query = query.orderBy("precioVenta", filtros.orden);

  // Paginación
  if (direccion === "next" && ultimoDoc) {
    query = query.startAfter(ultimoDoc);
  } else if (direccion === "prev" && primerDoc) {
    query = query.endBefore(primerDoc);
  }

  return query.limit(PRODUCTOS_POR_PAGINA);
}

/**
 * 🎯 Obtener filtros actuales del formulario
 * @returns {Object} Objeto con todos los filtros
 */
function obtenerFiltros() {
  return {
    search: elementos.search.value.toLowerCase().trim(),
    categoria: elementos.categoria.value,
    marca: elementos.marca.value,
    genero: elementos.genero.value,
    orden: elementos.orden.value
  };
}

/**
 * 📦 Cargar productos desde Firestore
 * @param {string} direccion - Dirección de navegación
 */
async function cargarProductos(direccion = "next") {
  mostrarLoading(true);
  
  try {
    const query = construirQuery(direccion);
    const snapshot = await query.get();

    if (snapshot.empty) {
      mostrarProductosVacios();
      return;
    }

    // Gestionar documentos para paginación
    primerDoc = snapshot.docs[0];
    ultimoDoc = snapshot.docs[snapshot.docs.length - 1];

    if (direccion === "next") {
      stackDocs.push(primerDoc);
      paginaActual++;
    } else if (direccion === "prev") {
      stackDocs.pop();
      paginaActual--;
    }

    await renderizarProductos(snapshot.docs);
    actualizarEstadoPaginacion(snapshot.docs.length);
    
  } catch (error) {
    console.error("Error cargando productos:", error);
    mostrarError();
  } finally {
    mostrarLoading(false);
  }
}

/**
 * 🎨 Renderizar productos con animaciones
 * @param {Array} docs - Documentos de Firestore
 */
async function renderizarProductos(docs) {
  const filtros = obtenerFiltros();
  elementos.productos.innerHTML = "";
  totalProductosMostrados = 0;

  // Aplicar filtro de búsqueda por texto
  const docsFiltrados = docs.filter(doc => {
    const producto = doc.data();
    return !filtros.search || producto.nombre.toLowerCase().includes(filtros.search);
  });

  if (docsFiltrados.length === 0) {
    mostrarProductosVacios();
    return;
  }

  // Renderizar cada producto con animación escalonada
  docsFiltrados.forEach((doc, index) => {
    setTimeout(() => {
      const producto = doc.data();
      const card = crearTarjetaProducto(producto);
      elementos.productos.appendChild(card);
      totalProductosMostrados++;
    }, index * 100);
  });

  // Actualizar contador después de renderizar
  setTimeout(() => {
    elementos.totalProductos.textContent = totalProductosMostrados;
    elementos.noProductos.classList.add("hidden");
    elementos.productos.classList.remove("hidden");
  }, docsFiltrados.length * 100);
}

/**
 * 🏷️ Crear tarjeta de producto
 * @param {Object} producto - Datos del producto
 * @returns {HTMLElement} Elemento DOM de la tarjeta
 */
function crearTarjetaProducto(producto) {
  const card = document.createElement("div");
  card.className = "product-card bg-white rounded-2xl shadow-lg overflow-hidden fade-in";

  // Determinar si está en oferta
  const descuento = producto.descuento || 0;
  const enOferta = descuento > 10;
  const precioOriginal = descuento > 0 ? producto.precioVenta / (1 - descuento/100) : null;

  // Determinar estado del stock
  const stock = producto.stock || 0;
  const stockClass = stock === 0 ? 'out-of-stock' : stock < 10 ? 'low-stock' : '';
  const stockText = stock === 0 ? 'Agotado' : stock < 10 ? `Quedan ${stock}` : `${stock} disponibles`;

  card.innerHTML = `
    <div class="relative image-hover-effect">
      <img src="${producto.imagenUrl || '/api/placeholder/300/200'}" 
           alt="${producto.nombre}" 
           class="w-full h-48 object-cover"
           onerror="this.src='/api/placeholder/300/200'" />
      
      ${enOferta ? `
        <div class="offer-badge absolute top-3 left-3 bg-gradient-to-r from-red-500 to-pink-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
          🏷️ EN OFERTA -${descuento}%
        </div>
      ` : ''}
      
      <div class="absolute top-3 right-3 glass-effect rounded-full px-2 py-1 text-xs font-semibold text-gray-700">
        ${producto.categoriaNombre || 'Sin categoría'}
      </div>
    </div>

    <div class="p-4">
      <div class="flex justify-between items-start mb-2">
        <h3 class="text-lg font-bold text-gray-800 line-clamp-2">${producto.nombre}</h3>
      </div>

      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm text-gray-500">🏷️ ${producto.marcaNombre || 'Sin marca'}</span>
        ${producto.genero ? `<span class="text-sm text-gray-500">• ${producto.genero}</span>` : ''}
      </div>

      <p class="text-gray-600 text-sm mb-3 line-clamp-2">${producto.descripcion || 'Sin descripción disponible'}</p>

      <div class="flex items-center justify-between mb-3">
        <div class="flex flex-col">
          ${precioOriginal && enOferta ? `
            <span class="text-sm text-gray-500 line-through">S/ ${precioOriginal.toFixed(2)}</span>
          ` : ''}
          <span class="text-2xl font-bold text-pink-600">S/ ${producto.precioVenta.toFixed(2)}</span>
        </div>
        
        <button class="btn-hover-effect micro-bounce bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all transform hover:scale-105 ${stock === 0 ? 'opacity-50 cursor-not-allowed' : ''}" 
                onclick="agregarAlCarrito('${producto.id || 'N/A'}')"
                ${stock === 0 ? 'disabled' : ''}>
          🛒 ${stock === 0 ? 'Agotado' : 'Agregar'}
        </button>
      </div>

      ${producto.stock !== undefined ? `
        <div class="stock-indicator ${stockClass} text-xs text-gray-500 pl-3">
          Stock: ${stockText}
        </div>
      ` : ''}
    </div>
  `;

  return card;
}

// =================================
//      FUNCIONES DE UTILIDAD
// =================================

/**
 * 🔄 Mostrar/ocultar loading spinner
 * @param {boolean} mostrar - Si mostrar o no el loading
 */
function mostrarLoading(mostrar) {
  elementos.loading.classList.toggle("hidden", !mostrar);
  elementos.productos.classList.toggle("hidden", mostrar);
  elementos.noProductos.classList.add("hidden");
}

/**
 * 📭 Mostrar mensaje cuando no hay productos
 */
function mostrarProductosVacios() {
  elementos.productos.classList.add("hidden");
  elementos.noProductos.classList.remove("hidden");
  elementos.totalProductos.textContent = "0";
  totalProductosMostrados = 0;
}

/**
 * ⚠️ Mostrar mensaje de error
 */
function mostrarError() {
  elementos.productos.innerHTML = `
    <div class="col-span-full text-center py-12">
      <div class="text-6xl mb-4">⚠️</div>
      <h3 class="text-xl font-semibold text-red-600 mb-2">Error al cargar productos</h3>
      <p class="text-gray-500">Por favor, intenta de nuevo más tarde</p>
      <button onclick="cargarProductos()" class="mt-4 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
        🔄 Reintentar
      </button>
    </div>
  `;
}

/**
 * 🔄 Resetear paginación y cargar primera página
 */
function resetearPaginacion() {
  ultimoDoc = null;
  primerDoc = null;
  stackDocs = [];
  paginaActual = 1;
  elementos.paginaActual.textContent = paginaActual;
  cargarProductos();
}

/**
 * 🎛️ Actualizar estado de botones de paginación
 * @param {number} cantidadDocs - Cantidad de documentos obtenidos
 */
function actualizarEstadoPaginacion(cantidadDocs) {
  elementos.prev.disabled = stackDocs.length <= 1;
  elementos.next.disabled = cantidadDocs < PRODUCTOS_POR_PAGINA;
  elementos.paginaActual.textContent = paginaActual;
}

/**
 * 🗑️ Limpiar todos los filtros
 */
function limpiarFiltros() {
  elementos.search.value = "";
  elementos.categoria.value = "";
  elementos.marca.value = "";
  elementos.genero.value = "";
  elementos.orden.value = "asc";
  resetearPaginacion();
}

/**
 * 🚀 Función debounce para optimizar búsqueda
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Tiempo de espera en ms
 * @returns {Function} Función con debounce aplicado
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 🛒 Agregar producto al carrito (función placeholder)
 * @param {string} productoId - ID del producto
 */
function agregarAlCarrito(productoId) {
  console.log(`Agregando producto ${productoId} al carrito`);
  
  // Mostrar feedback visual
  mostrarNotificacion('🛒 Producto agregado al carrito', 'success');
  
  // Aquí iría la lógica real del carrito
  // Por ejemplo: localStorage, base de datos, etc.
}

/**
 * 📢 Mostrar notificación temporal
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} tipo - Tipo de notificación ('success', 'error', 'info')
 */
function mostrarNotificacion(mensaje, tipo = 'info') {
  const notificacion = document.createElement('div');
  notificacion.className = `fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
  
  const colores = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white'
  };
  
  notificacion.className += ` ${colores[tipo]}`;
  notificacion.innerHTML = `
    <div class="flex items-center gap-2">
      <span>${mensaje}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-2 hover:opacity-75">
        ✕
      </button>
    </div>
  `;
  
  document.body.appendChild(notificacion);
  
  // Mostrar con animación
  setTimeout(() => {
    notificacion.classList.remove('translate-x-full');
  }, 100);
  
  // Ocultar automáticamente después de 3 segundos
  setTimeout(() => {
    notificacion.classList.add('translate-x-full');
    setTimeout(() => notificacion.remove(), 300);
  }, 3000);
}

/**
 * 🎯 Cargar opciones dinámicamente para los filtros
 */
async function cargarOpcionesFiltros() {
  try {
    // Cargar categorías
    const categoriasSnapshot = await db.collection("productos")
      .orderBy("categoriaNombre")
      .get();
    
    const categorias = new Set();
    const marcas = new Set();
    const generos = new Set();
    
    categoriasSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.categoriaNombre) categorias.add(data.categoriaNombre);
      if (data.marcaNombre) marcas.add(data.marcaNombre);
      if (data.genero) generos.add(data.genero);
    });
    
    // Llenar select de categorías
    categorias.forEach(categoria => {
      const option = document.createElement('option');
      option.value = categoria;
      option.textContent = categoria;
      elementos.categoria.appendChild(option);
    });
    
    // Llenar select de marcas
    marcas.forEach(marca => {
      const option = document.createElement('option');
      option.value = marca;
      option.textContent = marca;
      elementos.marca.appendChild(option);
    });
    
    // Llenar select de géneros
    generos.forEach(genero => {
      const option = document.createElement('option');
      option.value = genero;
      option.textContent = genero;
      elementos.genero.appendChild(option);
    });
    
  } catch (error) {
    console.error("Error cargando opciones de filtros:", error);
  }
}

/**
 * 💾 Guardar estado de filtros en localStorage
 */
function guardarEstadoFiltros() {
  const filtros = obtenerFiltros();
  localStorage.setItem('filtrosTienda', JSON.stringify(filtros));
}

/**
 * 📂 Cargar estado de filtros desde localStorage
 */
function cargarEstadoFiltros() {
  try {
    const filtrosGuardados = localStorage.getItem('filtrosTienda');
    if (filtrosGuardados) {
      const filtros = JSON.parse(filtrosGuardados);
      elementos.search.value = filtros.search || '';
      elementos.categoria.value = filtros.categoria || '';
      elementos.marca.value = filtros.marca || '';
      elementos.genero.value = filtros.genero || '';
      elementos.orden.value = filtros.orden || 'asc';
    }
  } catch (error) {
    console.error("Error cargando estado de filtros:", error);
  }
}

/**
 * 📊 Actualizar estadísticas de la tienda
 */
async function actualizarEstadisticas() {
  try {
    const totalSnapshot = await db.collection("productos").get();
    const totalGeneral = totalSnapshot.docs.length;
    
    // Aquí podrías agregar más estadísticas como:
    // - Productos en oferta
    // - Productos más vendidos
    // - etc.
    
    console.log(`Total de productos en la base de datos: ${totalGeneral}`);
  } catch (error) {
    console.error("Error actualizando estadísticas:", error);
  }
}

// =================================
//       EVENT LISTENERS
// =================================

/**
 * 🎧 Configurar todos los event listeners
 */
function configurarEventListeners() {
  // Filtros con debounce para optimizar performance
  elementos.search.addEventListener("input", debounce(() => {
    guardarEstadoFiltros();
    resetearPaginacion();
  }, 500));
  
  elementos.categoria.addEventListener("change", () => {
    guardarEstadoFiltros();
    resetearPaginacion();
  });
  
  elementos.marca.addEventListener("change", () => {
    guardarEstadoFiltros();
    resetearPaginacion();
  });
  
  elementos.genero.addEventListener("change", () => {
    guardarEstadoFiltros();
    resetearPaginacion();
  });
  
  elementos.orden.addEventListener("change", () => {
    guardarEstadoFiltros();
    resetearPaginacion();
  });
  
  // Botón limpiar filtros
  elementos.clearFilters.addEventListener("click", () => {
    localStorage.removeItem('filtrosTienda');
    limpiarFiltros();
  });

  // Navegación de páginas
  elementos.next.addEventListener("click", () => {
    if (!elementos.next.disabled) {
      cargarProductos("next");
    }
  });

  elementos.prev.addEventListener("click", () => {
    if (!elementos.prev.disabled && stackDocs.length > 1) {
      cargarProductos("prev");
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K para enfocar búsqueda
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      elementos.search.focus();
    }
    
    // Escape para limpiar filtros
    if (e.key === 'Escape') {
      limpiarFiltros();
    }
    
    // Flechas para navegación
    if (e.key === 'ArrowLeft' && !elementos.prev.disabled) {
      elementos.prev.click();
    }
    if (e.key === 'ArrowRight' && !elementos.next.disabled) {
      elementos.next.click();
    }
  });
}

// =================================
//       INICIALIZACIÓN
// =================================

/**
 * 🚀 Función principal de inicialización
 */
async function inicializarApp() {
  try {
    // Mostrar loading inicial
    mostrarLoading(true);
    
    // Configurar event listeners
    configurarEventListeners();
    
    // Cargar opciones de filtros
    await cargarOpcionesFiltros();
    
    // Cargar estado guardado de filtros
    cargarEstadoFiltros();
    
    // Cargar productos iniciales
    await cargarProductos();
    
    // Actualizar estadísticas
    await actualizarEstadisticas();
    
    console.log("🎉 Aplicación inicializada correctamente");
    
  } catch (error) {
    console.error("❌ Error inicializando la aplicación:", error);
    mostrarError();
  }
}

// =================================
//    EVENTOS DE CARGA DE PÁGINA
// =================================

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarApp);
} else {
  inicializarApp();
}

// Manejar errores globales
window.addEventListener('error', (e) => {
  console.error('Error global capturado:', e.error);
  mostrarNotificacion('❌ Ocurrió un error inesperado', 'error');
});

// Manejar errores de promesas no capturadas
window.addEventListener('unhandledrejection', (e) => {
  console.error('Promesa rechazada no manejada:', e.reason);
  mostrarNotificacion('❌ Error de conexión', 'error');
  e.preventDefault();
});

// =================================
//      FUNCIONES ADICIONALES
// =================================

/**
 * 🔍 Búsqueda avanzada por voz (Web Speech API)
 */
function iniciarBusquedaPorVoz() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
      mostrarNotificacion('🎤 Escuchando...', 'info');
    };
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      elementos.search.value = transcript;
      mostrarNotificacion(`🔍 Buscando: "${transcript}"`, 'success');
      resetearPaginacion();
    };
    
    recognition.onerror = () => {
      mostrarNotificacion('❌ Error en reconocimiento de voz', 'error');
    };
    
    recognition.start();
  } else {
    mostrarNotificacion('❌ Tu navegador no soporta reconocimiento de voz', 'error');
  }
}

/**
 * 📤 Exportar lista de productos actual
 */
function exportarProductos() {
  const productosActuales = Array.from(document.querySelectorAll('.product-card')).map(card => {
    const nombre = card.querySelector('h3').textContent;
    const precio = card.querySelector('.text-pink-600').textContent;
    return { nombre, precio };
  });
  
  const csv = 'Nombre,Precio\n' + 
    productosActuales.map(p => `"${p.nombre}","${p.precio}"`).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'productos.csv';
  a.click();
  window.URL.revokeObjectURL(url);
  
  mostrarNotificacion('📤 Lista exportada correctamente', 'success');
}

// Exponer funciones globales para uso desde HTML
window.agregarAlCarrito = agregarAlCarrito;
window.iniciarBusquedaPorVoz = iniciarBusquedaPorVoz;
window.exportarProductos = exportarProductos;