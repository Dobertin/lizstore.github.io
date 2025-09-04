// 🔥 Configuración Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, limit, startAfter, endBefore, getDocs, limitToLast } 
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
const PRODUCTOS_POR_PAGINA = 10;
let ultimoDoc = null;
let primerDoc = null;
let paginaActual = 1;
let totalProductosMostrados = 0;
let filtrosActivos = {}; // Para mantener consistencia en los filtros
let modoBuffer = false; // Indica si estamos en modo búsqueda por buffer
let productosBuffer = []; // Buffer para productos de búsqueda
let indiceBuffer = 0; // Índice actual en el buffer

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
 * @param {string} direccion - Dirección de paginación ('next', 'prev', o 'first')
 * @returns {Query} Consulta de Firestore
 */
function construirQuery(direccion = "first") {
  const productosRef = collection(db, 'productos');
  let condiciones = [];

  // Aplicar filtros exactos usando los filtros guardados para mantener consistencia
  if (filtrosActivos.categoria) {
    condiciones.push(where("categoriaNombre", "==", filtrosActivos.categoria));
  }
  if (filtrosActivos.marca) {
    condiciones.push(where("marcaNombre", "==", filtrosActivos.marca));
  }
  if (filtrosActivos.genero) {
    condiciones.push(where("genero", "==", filtrosActivos.genero));
  }

  // Ordenamiento
  condiciones.push(orderBy("precioVenta", filtrosActivos.orden || "asc"));

  // Paginación mejorada
  if (direccion === "next" && ultimoDoc) {
    condiciones.push(startAfter(ultimoDoc));
    condiciones.push(limit(PRODUCTOS_POR_PAGINA));
  } else if (direccion === "prev" && primerDoc) {
    // Para ir hacia atrás, necesitamos una consulta inversa
    const ordenInverso = filtrosActivos.orden === "asc" ? "desc" : "asc";
    condiciones = condiciones.slice(0, -1); // Remover el orderBy anterior
    condiciones.push(orderBy("precioVenta", ordenInverso));
    condiciones.push(startAfter(primerDoc));
    condiciones.push(limit(PRODUCTOS_POR_PAGINA));
  } else {
    condiciones.push(limit(PRODUCTOS_POR_PAGINA));
  }

  return query(productosRef, ...condiciones);
}

/**
 * 🔽 Obtener filtros actuales del formulario
 * @returns {Object} Objeto con todos los filtros
 */
function obtenerFiltros() {
  return {
    search: elementos.search.value.toLowerCase().trim(),
    categoria: elementos.categoria.value,
    marca: elementos.marca.value,
    genero: elementos.genero.value,
    orden: elementos.orden.value || "asc"
  };
}

/**
 * 🔍 Búsqueda inteligente en toda la colección de Firestore
 * @param {string} textoBusqueda - Término de búsqueda
 */
async function realizarBusquedaInteligente(textoBusqueda) {
  mostrarLoading(true);
  
  try {
    console.log(`🔍 Iniciando búsqueda inteligente para: "${textoBusqueda}"`);
    
    // Construir consulta para buscar en toda la colección
    const productosRef = collection(db, 'productos');
    let condiciones = [];
    
    // Aplicar otros filtros (excepto búsqueda por texto)
    if (filtrosActivos.categoria) {
      condiciones.push(where("categoriaNombre", "==", filtrosActivos.categoria));
    }
    if (filtrosActivos.marca) {
      condiciones.push(where("marcaNombre", "==", filtrosActivos.marca));
    }
    if (filtrosActivos.genero) {
      condiciones.push(where("genero", "==", filtrosActivos.genero));
    }
    
    // Ordenamiento
    condiciones.push(orderBy("precioVenta", filtrosActivos.orden || "asc"));
    
    // Obtener TODOS los productos que coincidan con los filtros (sin límite para búsqueda)
    const q = query(productosRef, ...condiciones);
    const snapshot = await getDocs(q);
    
    console.log(`📊 Productos obtenidos de Firestore: ${snapshot.docs.length}`);
    
    // Filtrar por texto de búsqueda en memoria
    const productosFiltrados = snapshot.docs.filter(doc => {
      const producto = doc.data();
      const nombre = producto.nombre.toLowerCase();
      const descripcion = (producto.descripcion || '').toLowerCase();
      const categoria = (producto.categoriaNombre || '').toLowerCase();
      const marca = (producto.marcaNombre || '').toLowerCase();
      
      return nombre.includes(textoBusqueda) || 
             descripcion.includes(textoBusqueda) ||
             categoria.includes(textoBusqueda) ||
             marca.includes(textoBusqueda);
    });
    
    console.log(`🎯 Productos encontrados con búsqueda: ${productosFiltrados.length}`);
    
    if (productosFiltrados.length === 0) {
      // No se encontraron productos
      mostrarProductosVacios();
      mostrarNotificacion(`🔍 No se encontraron productos que coincidan con "${textoBusqueda}"`, 'info');
      return;
    }
    
    // Cambiar a modo buffer para manejar los resultados de búsqueda
    modoBuffer = true;
    productosBuffer = productosFiltrados;
    indiceBuffer = 0;
    paginaActual = 1;
    
    // Mostrar la primera página de resultados
    mostrarPaginaBuffer();
    
    mostrarNotificacion(`🎉 Se encontraron ${productosFiltrados.length} productos`, 'success');
    
  } catch (error) {
    console.error("❌ Error en búsqueda inteligente:", error);
    mostrarError();
    mostrarNotificacion('❌ Error en la búsqueda', 'error');
  } finally {
    mostrarLoading(false);
  }
}

/**
 * 📄 Mostrar página del buffer de búsqueda
 */
function mostrarPaginaBuffer() {
  const inicio = indiceBuffer;
  const fin = Math.min(inicio + PRODUCTOS_POR_PAGINA, productosBuffer.length);
  const productosPagina = productosBuffer.slice(inicio, fin);
  
  console.log(`📄 Mostrando productos ${inicio + 1}-${fin} de ${productosBuffer.length}`);
  
  // Renderizar productos de la página actual
  renderizarProductosBuffer(productosPagina);
  
  // Actualizar estado de paginación para modo buffer
  actualizarEstadoPaginacionBuffer();
}

/**
 * 🎨 Renderizar productos del buffer
 * @param {Array} docs - Documentos de Firestore
 */
async function renderizarProductosBuffer(docs) {
  elementos.productos.innerHTML = "";
  totalProductosMostrados = 0;

  if (docs.length === 0) {
    mostrarProductosVacios();
    return;
  }

  // Renderizar cada producto con animación escalonada
  docs.forEach((doc, index) => {
    setTimeout(() => {
      const producto = doc.data();
      producto.id = doc.id;
      const card = crearTarjetaProducto(producto);
      elementos.productos.appendChild(card);
      totalProductosMostrados++;
    }, index * 100);
  });

  // Actualizar contador después de renderizar
  setTimeout(() => {
    elementos.totalProductos.textContent = `${totalProductosMostrados} de ${productosBuffer.length}`;
    elementos.noProductos.classList.add("hidden");
    elementos.productos.classList.remove("hidden");
  }, docs.length * 100);
}

/**
 * 🎮 Actualizar estado de botones para modo buffer
 */
function actualizarEstadoPaginacionBuffer() {
  const totalPaginas = Math.ceil(productosBuffer.length / PRODUCTOS_POR_PAGINA);
  
  elementos.prev.disabled = paginaActual <= 1;
  elementos.next.disabled = paginaActual >= totalPaginas;
  elementos.paginaActual.textContent = `${paginaActual} de ${totalPaginas}`;
  
  console.log(`🎮 Buffer paginación:`, {
    paginaActual,
    totalPaginas,
    totalProductos: productosBuffer.length,
    indiceBuffer
  });
}

/**
 * 📚 Cargar productos desde Firestore (modo normal)
 * @param {string} direccion - Dirección de navegación
 */
async function cargarProductos(direccion = "first") {
  // Si estamos en modo buffer y no es un reset, manejar navegación del buffer
  if (modoBuffer && direccion !== "reset" && direccion !== "first") {
    navegarBuffer(direccion);
    return;
  }
  
  // Salir del modo buffer si es necesario
  if (modoBuffer && (direccion === "reset" || direccion === "first")) {
    modoBuffer = false;
    productosBuffer = [];
    indiceBuffer = 0;
  }
  
  mostrarLoading(true);
  
  try {
    // Actualizar filtros activos al cargar
    if (direccion === "first" || direccion === "reset") {
      filtrosActivos = obtenerFiltros();
      paginaActual = 1;
      ultimoDoc = null;
      primerDoc = null;
    }

    let q, snapshot;

    if (direccion === "prev" && primerDoc && paginaActual > 1) {
      // Para página anterior, construimos una consulta especial
      q = construirQueryAnterior();
      snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        // Invertir el orden de los documentos ya que vienen al revés
        const docs = snapshot.docs.reverse();
        await renderizarProductos(docs);
        
        primerDoc = docs[0];
        ultimoDoc = docs[docs.length - 1];
        paginaActual--;
        actualizarEstadoPaginacion(docs.length);
      }
    } else {
      // Para primera página o siguiente página
      q = construirQuery(direccion);
      snapshot = await getDocs(q);

      if (snapshot.empty) {
        if (direccion === "first" || direccion === "reset") {
          mostrarProductosVacios();
        }
        return;
      }

      // Gestionar documentos para paginación
      primerDoc = snapshot.docs[0];
      ultimoDoc = snapshot.docs[snapshot.docs.length - 1];

      if (direccion === "next") {
        paginaActual++;
      }

      await renderizarProductos(snapshot.docs);
      actualizarEstadoPaginacion(snapshot.docs.length);
    }
    
  } catch (error) {
    console.error("Error cargando productos:", error);
    mostrarError();
  } finally {
    mostrarLoading(false);
  }
}

/**
 * 🔄 Navegar en el buffer de resultados de búsqueda
 * @param {string} direccion - 'next' o 'prev'
 */
function navegarBuffer(direccion) {
  if (direccion === "next") {
    const siguienteIndice = indiceBuffer + PRODUCTOS_POR_PAGINA;
    if (siguienteIndice < productosBuffer.length) {
      indiceBuffer = siguienteIndice;
      paginaActual++;
      mostrarPaginaBuffer();
    }
  } else if (direccion === "prev") {
    const anteriorIndice = indiceBuffer - PRODUCTOS_POR_PAGINA;
    if (anteriorIndice >= 0) {
      indiceBuffer = anteriorIndice;
      paginaActual--;
      mostrarPaginaBuffer();
    }
  }
}

/**
 * 🔙 Construir consulta para página anterior
 */
function construirQueryAnterior() {
  const productosRef = collection(db, 'productos');
  let condiciones = [];

  // Aplicar los mismos filtros
  if (filtrosActivos.categoria) {
    condiciones.push(where("categoriaNombre", "==", filtrosActivos.categoria));
  }
  if (filtrosActivos.marca) {
    condiciones.push(where("marcaNombre", "==", filtrosActivos.marca));
  }
  if (filtrosActivos.genero) {
    condiciones.push(where("genero", "==", filtrosActivos.genero));
  }

  // Orden inverso para obtener la página anterior
  const ordenInverso = filtrosActivos.orden === "asc" ? "desc" : "asc";
  condiciones.push(orderBy("precioVenta", ordenInverso));
  
  // Empezar antes del primer documento actual
  condiciones.push(endBefore(primerDoc));
  condiciones.push(limitToLast(PRODUCTOS_POR_PAGINA));

  return query(productosRef, ...condiciones);
}

/**
 * 🎨 Renderizar productos con animaciones
 * @param {Array} docs - Documentos de Firestore
 */
async function renderizarProductos(docs) {
  elementos.productos.innerHTML = "";
  totalProductosMostrados = 0;

  // Aplicar filtro de búsqueda por texto solo a los datos ya obtenidos
  let docsFiltrados = docs;
  if (filtrosActivos.search) {
    docsFiltrados = docs.filter(doc => {
      const producto = doc.data();
      const nombre = producto.nombre.toLowerCase();
      const descripcion = (producto.descripcion || '').toLowerCase();
      const categoria = (producto.categoriaNombre || '').toLowerCase();
      const marca = (producto.marcaNombre || '').toLowerCase();
      
      return nombre.includes(filtrosActivos.search) ||
             descripcion.includes(filtrosActivos.search) ||
             categoria.includes(filtrosActivos.search) ||
             marca.includes(filtrosActivos.search);
    });
  }

  if (docsFiltrados.length === 0) {
    // Si no hay resultados en la página actual y hay texto de búsqueda,
    // realizar búsqueda en toda la colección
    if (filtrosActivos.search) {
      console.log("🔍 No se encontraron resultados en la página actual, buscando en toda la colección...");
      await realizarBusquedaInteligente(filtrosActivos.search);
      return;
    }
    
    mostrarProductosVacios();
    return;
  }

  // Renderizar cada producto con animación escalonada
  docsFiltrados.forEach((doc, index) => {
    setTimeout(() => {
      const producto = doc.data();
      producto.id = doc.id; // Asegurar que el ID esté presente
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
 * 🎯️ Crear tarjeta de producto
 * @param {Object} producto - Datos del producto
 * @returns {HTMLElement} Elemento DOM de la tarjeta
 */
function crearTarjetaProducto(producto) {
  const card = document.createElement("div");
  card.className = "product-card bg-white rounded-2xl shadow-lg overflow-hidden fade-in";

  // Calcular descuento basado en precioCatalogo vs precioVenta
  const precioCatalogo = producto.precioCatalogo || 0;
  const precioVenta = producto.precioVenta || 0;
  
  let enPromocion = false;
  let porcentajeDescuento = 0;
  
  if (precioCatalogo > 0 && precioVenta > 0 && precioCatalogo > precioVenta) {
    porcentajeDescuento = Math.round(((precioCatalogo - precioVenta) / precioCatalogo) * 100);
    enPromocion = porcentajeDescuento > 0;
  }

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
      
      ${enPromocion ? `
        <div class="offer-badge absolute top-3 left-3 bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg animate-pulse">
          🎉 PROMOCIÓN -${porcentajeDescuento}%
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
        <span class="text-sm text-gray-500">🎯️${producto.marcaNombre || 'Sin marca'}</span>
        ${producto.genero ? `<span class="text-sm text-gray-500">• ${producto.genero}</span>` : ''}
      </div>

      <p class="text-gray-600 text-sm mb-3 line-clamp-2">${producto.descripcion || 'Sin descripción disponible'}</p>

      <div class="flex items-center justify-between mb-3">
        <div class="flex flex-col">
          ${enPromocion && precioCatalogo > 0 ? `
            <span class="text-sm text-gray-500 line-through font-medium">S/ ${precioCatalogo.toFixed(2)}</span>
          ` : ''}
          <span class="text-2xl font-bold ${enPromocion ? 'text-red-600 animate-pulse' : 'text-pink-600'}">
            S/ ${precioVenta.toFixed(2)}
          </span>
          ${enPromocion ? `
            <span class="text-xs text-green-600 font-semibold">¡Ahorra S/ ${(precioCatalogo - precioVenta).toFixed(2)}!</span>
          ` : ''}
        </div>
        
        <button class="btn-hover-effect micro-bounce bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all transform hover:scale-105 ${stock === 0 ? 'opacity-50 cursor-not-allowed' : ''}" 
                onclick="agregarAlCarrito('${producto.id || 'N/A'}')"
                ${stock === 0 ? 'disabled' : ''}>
          📦 ${stock === 0 ? 'Agotado' : 'Agregar'}
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
 * ⏳ Mostrar/ocultar loading spinner
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
      <button onclick="cargarProductos('reset')" class="mt-4 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
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
  paginaActual = 1;
  modoBuffer = false;
  productosBuffer = [];
  indiceBuffer = 0;
  elementos.paginaActual.textContent = paginaActual;
  cargarProductos("reset");
}

/**
 * 🎮️ Actualizar estado de botones de paginación
 * @param {number} cantidadDocs - Cantidad de documentos obtenidos
 */
function actualizarEstadoPaginacion(cantidadDocs) {
  elementos.prev.disabled = paginaActual <= 1;
  elementos.next.disabled = cantidadDocs < PRODUCTOS_POR_PAGINA;
  elementos.paginaActual.textContent = paginaActual;
  
  // Debug mejorado
  console.log(`🔍 Estado paginación:`, {
    paginaActual,
    cantidadDocs,
    prevDisabled: elementos.prev.disabled,
    nextDisabled: elementos.next.disabled,
    tieneUltimoDoc: !!ultimoDoc,
    tienePrimerDoc: !!primerDoc,
    modoBuffer
  });
}

/**
 * 🧹️ Limpiar todos los filtros
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
 * 📦 Agregar producto al carrito (función placeholder)
 * @param {string} productoId - ID del producto
 */
function agregarAlCarrito(productoId) {
  console.log(`Agregando producto ${productoId} al carrito`);
  
  // Mostrar feedback visual
  mostrarNotificacion('📦 Producto agregado al carrito', 'success');
  
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
 * 🔽 Cargar opciones dinámicamente para los filtros
 */
async function cargarOpcionesFiltros() {
  try {
    const productosRef = collection(db, "productos");
    const q = query(productosRef, orderBy("categoriaNombre"));
    const snapshot = await getDocs(q);
    
    const categorias = new Set();
    const marcas = new Set();
    const generos = new Set();
    
    snapshot.docs.forEach(doc => {
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
    const productosRef = collection(db, "productos");
    const snapshot = await getDocs(productosRef);
    const totalGeneral = snapshot.docs.length;
    
    console.log(`Total de productos en la base de datos: ${totalGeneral}`);
  } catch (error) {
    console.error("Error actualizando estadísticas:", error);
  }
}

// =================================
//       EVENT LISTENERS
// =================================

/**
 * 🎛️ Configurar todos los event listeners
 */
function configurarEventListeners() {
  // Filtros con debounce para optimizar performance
  elementos.search.addEventListener("input", debounce(async (e) => {
    const textoBusqueda = e.target.value.toLowerCase().trim();
    
    if (textoBusqueda === '') {
      // Si el campo está vacío, restaurar vista normal
      resetearPaginacion();
      return;
    }
    
    // Guardar filtros y realizar búsqueda inteligente
    guardarEstadoFiltros();
    filtrosActivos = obtenerFiltros();
    
    // Realizar búsqueda inteligente directamente
    await realizarBusquedaInteligente(textoBusqueda);
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
    // Si estamos en modo buffer, reordenar los resultados
    if (modoBuffer) {
      const orden = elementos.orden.value;
      productosBuffer.sort((a, b) => {
        const precioA = a.data().precioVenta;
        const precioB = b.data().precioVenta;
        return orden === "asc" ? precioA - precioB : precioB - precioA;
      });
      indiceBuffer = 0;
      paginaActual = 1;
      mostrarPaginaBuffer();
    } else {
      resetearPaginacion();
    }
  });
  
  // Botón limpiar filtros
  elementos.clearFilters.addEventListener("click", () => {
    localStorage.removeItem('filtrosTienda');
    limpiarFiltros();
  });

  // Navegación de páginas mejorada
  elementos.next.addEventListener("click", () => {
    if (!elementos.next.disabled) {
      cargarProductos("next");
    }
  });

  elementos.prev.addEventListener("click", () => {
    if (!elementos.prev.disabled && paginaActual > 1) {
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
    
    // Si hay texto de búsqueda guardado, realizar búsqueda inteligente
    const filtrosIniciales = obtenerFiltros();
    if (filtrosIniciales.search) {
      filtrosActivos = filtrosIniciales;
      await realizarBusquedaInteligente(filtrosIniciales.search);
    } else {
      // Cargar productos iniciales normalmente
      await cargarProductos("first");
    }
    
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
    
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      elementos.search.value = transcript;
      mostrarNotificacion(`🔍 Buscando: "${transcript}"`, 'success');
      
      // Realizar búsqueda inteligente con el texto reconocido
      filtrosActivos = obtenerFiltros();
      await realizarBusquedaInteligente(transcript.toLowerCase().trim());
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
 * 📊 Exportar lista de productos actual
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
  
  mostrarNotificacion('📊 Lista exportada correctamente', 'success');
}

/**
 * 🎯 Resaltar texto de búsqueda en los productos
 * @param {string} texto - Texto original
 * @param {string} busqueda - Término de búsqueda
 * @returns {string} Texto con resaltado HTML
 */
function resaltarTexto(texto, busqueda) {
  if (!busqueda || !texto) return texto;
  
  const regex = new RegExp(`(${busqueda})`, 'gi');
  return texto.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
}

/**
 * 🔄 Actualizar tarjetas de producto con resaltado de búsqueda
 */
function actualizarResaltadoBusqueda() {
  if (!filtrosActivos.search) return;
  
  const cards = document.querySelectorAll('.product-card');
  cards.forEach(card => {
    const titulo = card.querySelector('h3');
    const descripcion = card.querySelector('.text-gray-600');
    
    if (titulo && titulo.textContent) {
      titulo.innerHTML = resaltarTexto(titulo.textContent, filtrosActivos.search);
    }
    
    if (descripcion && descripcion.textContent) {
      descripcion.innerHTML = resaltarTexto(descripcion.textContent, filtrosActivos.search);
    }
  });
}

/**
 * 📱 Detectar si el usuario está en dispositivo móvil
 * @returns {boolean} True si es móvil
 */
function esMobile() {
  return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 🎨 Aplicar animaciones optimizadas para móvil
 */
function optimizarParaMobile() {
  if (esMobile()) {
    // Reducir animaciones en móviles para mejor rendimiento
    const style = document.createElement('style');
    style.innerHTML = `
      .fade-in { animation-duration: 0.2s !important; }
      .product-card { transition-duration: 0.2s !important; }
    `;
    document.head.appendChild(style);
    
    console.log('🔧 Optimizaciones móviles aplicadas');
  }
}

/**
 * 🧠 Sistema de caché inteligente para mejorar rendimiento
 */
const cache = {
  productos: new Map(),
  filtros: new Map(),
  
  // Guardar productos en caché
  guardarProductos(clave, productos) {
    this.productos.set(clave, {
      data: productos,
      timestamp: Date.now()
    });
  },
  
  // Obtener productos del caché
  obtenerProductos(clave) {
    const cached = this.productos.get(clave);
    if (!cached) return null;
    
    // Verificar si el caché no ha expirado (5 minutos)
    const CACHE_EXPIRY = 5 * 60 * 1000;
    if (Date.now() - cached.timestamp > CACHE_EXPIRY) {
      this.productos.delete(clave);
      return null;
    }
    
    return cached.data;
  },
  
  // Limpiar caché
  limpiar() {
    this.productos.clear();
    this.filtros.clear();
  }
};

// Exponer funciones globales para uso desde HTML
window.agregarAlCarrito = agregarAlCarrito;
window.iniciarBusquedaPorVoz = iniciarBusquedaPorVoz;
window.exportarProductos = exportarProductos;

// Aplicar optimizaciones al cargar
document.addEventListener('DOMContentLoaded', () => {
  optimizarParaMobile();
});