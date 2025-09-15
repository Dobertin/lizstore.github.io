// 🔥 Configuración Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, limit, startAfter, endBefore, getDocs, limitToLast } 
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 📱 Configuración de WhatsApp
const WHATSAPP_CONFIG = {
  numero: "+51912558460",
  baseUrl: "https://wa.me/"
};

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
const CONFIG = {
  PRODUCTOS_POR_PAGINA: 50,
  DEBOUNCE_DELAY: 500,
  CACHE_EXPIRY: 5 * 60 * 1000, // 5 minutos
  ANIMATION_DELAY: 100
};

let estadoApp = {
  ultimoDoc: null,
  primerDoc: null,
  paginaActual: 1,
  totalProductosMostrados: 0,
  filtrosActivos: {},
  modoBuffer: false,
  productosBuffer: [],
  indiceBuffer: 0
};

// 📱 Elementos del DOM - Inicialización lazy
const getElementos = (() => {
  let elementos = null;
  
  return () => {
    if (!elementos) {
      elementos = {
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
    }
    return elementos;
  };
})();

// =================================
//        SISTEMA DE CACHÉ
// =================================
const cache = {
  productos: new Map(),
  filtros: new Map(),
  
  generarClave(filtros) {
    return JSON.stringify(filtros);
  },
  
  guardar(clave, data) {
    this.productos.set(clave, {
      data,
      timestamp: Date.now()
    });
  },
  
  obtener(clave) {
    const cached = this.productos.get(clave);
    if (!cached || Date.now() - cached.timestamp > CONFIG.CACHE_EXPIRY) {
      this.productos.delete(clave);
      return null;
    }
    return cached.data;
  },
  
  limpiar() {
    this.productos.clear();
    this.filtros.clear();
  }
};

// =================================
//      FUNCIONES DE WHATSAPP
// =================================

/**
 * 📱 Generar URL de WhatsApp con mensaje personalizado
 * @param {string} nombreProducto - Nombre del producto
 * @returns {string} URL de WhatsApp
 */
function generarUrlWhatsApp(nombreProducto) {
  const mensaje = `Hola LizaChick estoy interesado en el Producto ${nombreProducto}`;
  const mensajeCodificado = encodeURIComponent(mensaje);
  return `${WHATSAPP_CONFIG.baseUrl}${WHATSAPP_CONFIG.numero}?text=${mensajeCodificado}`;
}

/**
 * 📱 Abrir chat de WhatsApp
 * @param {string} nombreProducto - Nombre del producto
 */
function abrirWhatsApp(nombreProducto) {
  const url = generarUrlWhatsApp(nombreProducto);
  window.open(url, '_blank');
  
  // Analytics/tracking (opcional)
  console.log(`WhatsApp abierto para producto: ${nombreProducto}`);
  mostrarNotificacion(`📱 Abriendo WhatsApp para consultar sobre "${nombreProducto}"`, 'success');
}

// =================================
//        FUNCIONES PRINCIPALES
// =================================

/**
 * 🔍 Construir consulta Firestore optimizada
 */
function construirQuery(direccion = "first") {
  const productosRef = collection(db, 'productos');
  const condiciones = [];

  // Aplicar filtros
  Object.entries(estadoApp.filtrosActivos).forEach(([key, value]) => {
    if (value && key !== 'search' && key !== 'orden') {
      const campo = key === 'categoria' ? 'categoriaNombre' : 
                   key === 'marca' ? 'marcaNombre' : key;
      condiciones.push(where(campo, "==", value));
    }
  });

  // Ordenamiento
  condiciones.push(orderBy("precioVenta", estadoApp.filtrosActivos.orden || "asc"));

  // Paginación
  if (direccion === "next" && estadoApp.ultimoDoc) {
    condiciones.push(startAfter(estadoApp.ultimoDoc));
  } else if (direccion === "prev" && estadoApp.primerDoc) {
    const ordenInverso = estadoApp.filtrosActivos.orden === "asc" ? "desc" : "asc";
    condiciones[condiciones.length - 1] = orderBy("precioVenta", ordenInverso);
    condiciones.push(startAfter(estadoApp.primerDoc));
  }

  condiciones.push(limit(CONFIG.PRODUCTOS_POR_PAGINA));
  return query(productosRef, ...condiciones);
}

/**
 * 📝 Obtener filtros del formulario
 */
function obtenerFiltros() {
  const elementos = getElementos();
  return {
    search: elementos.search.value.toLowerCase().trim(),
    categoria: elementos.categoria.value,
    marca: elementos.marca.value,
    genero: elementos.genero.value,
    orden: elementos.orden.value || "asc"
  };
}

/**
 * 🔍 Búsqueda inteligente optimizada
 */
async function realizarBusquedaInteligente(textoBusqueda) {
  const cacheKey = cache.generarClave({ ...estadoApp.filtrosActivos, search: textoBusqueda });
  const cached = cache.obtener(cacheKey);
  
  if (cached) {
    procesarResultadosBusqueda(cached, textoBusqueda);
    return;
  }

  mostrarLoading(true);
  
  try {
    const productosRef = collection(db, 'productos');
    const condiciones = [];
    
    // Aplicar filtros (excepto búsqueda)
    Object.entries(estadoApp.filtrosActivos).forEach(([key, value]) => {
      if (value && key !== 'search' && key !== 'orden') {
        const campo = key === 'categoria' ? 'categoriaNombre' : 
                     key === 'marca' ? 'marcaNombre' : key;
        condiciones.push(where(campo, "==", value));
      }
    });
    
    condiciones.push(orderBy("precioVenta", estadoApp.filtrosActivos.orden || "asc"));
    
    const q = query(productosRef, ...condiciones);
    const snapshot = await getDocs(q);
    
    // Filtrar en memoria
    const productosFiltrados = snapshot.docs.filter(doc => {
      const producto = doc.data();
      const textosBusqueda = [
        producto.nombre || '',
        producto.descripcion || '',
        producto.categoriaNombre || '',
        producto.marcaNombre || ''
      ].map(texto => texto.toLowerCase());
      
      return textosBusqueda.some(texto => texto.includes(textoBusqueda));
    });
    
    // Guardar en caché
    cache.guardar(cacheKey, productosFiltrados);
    procesarResultadosBusqueda(productosFiltrados, textoBusqueda);
    
  } catch (error) {
    console.error("Error en búsqueda:", error);
    mostrarError();
    mostrarNotificacion('❌ Error en la búsqueda', 'error');
  } finally {
    mostrarLoading(false);
  }
}

/**
 * 📊 Procesar resultados de búsqueda
 */
function procesarResultadosBusqueda(productosFiltrados, textoBusqueda) {
  if (productosFiltrados.length === 0) {
    mostrarProductosVacios();
    mostrarNotificacion(`🔍 No se encontraron productos para "${textoBusqueda}"`, 'info');
    return;
  }
  
  estadoApp.modoBuffer = true;
  estadoApp.productosBuffer = productosFiltrados;
  estadoApp.indiceBuffer = 0;
  estadoApp.paginaActual = 1;
  
  mostrarPaginaBuffer();
  mostrarNotificacion(`🎉 ${productosFiltrados.length} productos encontrados`, 'success');
}

/**
 * 📄 Mostrar página del buffer
 */
function mostrarPaginaBuffer() {
  const inicio = estadoApp.indiceBuffer;
  const fin = Math.min(inicio + CONFIG.PRODUCTOS_POR_PAGINA, estadoApp.productosBuffer.length);
  const productosPagina = estadoApp.productosBuffer.slice(inicio, fin);
  
  renderizarProductosBuffer(productosPagina);
  actualizarEstadoPaginacionBuffer();
}

/**
 * 🎨 Crear tarjeta de producto optimizada con WhatsApp
 */
function crearTarjetaProducto(producto) {
  const card = document.createElement("div");
  card.className = "product-card bg-white rounded-2xl shadow-lg overflow-hidden fade-in";

  // Calcular descuento
  const precioCatalogo = producto.precioCatalogo || 0;
  const precioVenta = producto.precioVenta || 0;
  const enPromocion = precioCatalogo > precioVenta && precioCatalogo > 0;
  const porcentajeDescuento = enPromocion ? 
    Math.round(((precioCatalogo - precioVenta) / precioCatalogo) * 100) : 0;

  // Estado del stock
  const stock = producto.stock || 0;
  const stockClass = stock === 0 ? 'out-of-stock' : stock < 10 ? 'low-stock' : '';
  const stockText = stock === 0 ? 'Agotado' : stock < 10 ? `Quedan ${stock}` : `${stock} disponibles`;

  card.innerHTML = `
    <div class="relative image-hover-effect">
      <img src="${producto.imagenUrl || '/api/placeholder/300/200'}" 
           alt="${producto.nombre}" 
           class="w-full h-48 object-cover transition-transform duration-300 hover:scale-105"
           onerror="this.src='/api/placeholder/300/200'" 
           loading="lazy" />
      
      ${enPromocion ? `
        <div class="offer-badge absolute top-3 left-3 bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
          🎉 -${porcentajeDescuento}%
        </div>
      ` : ''}
      
      <div class="absolute top-3 right-3 glass-effect rounded-full px-2 py-1 text-xs font-semibold text-gray-700 bg-white/80 backdrop-blur-sm">
        ${producto.categoriaNombre || 'Sin categoría'}
      </div>
    </div>

    <div class="p-4">
      <div class="flex justify-between items-start mb-2">
        <h3 class="text-lg font-bold text-gray-800 line-clamp-2 flex-1">${producto.nombre}</h3>
      </div>

      <div class="flex items-center gap-2 mb-2 text-sm text-gray-500">
        <span>🎯 ${producto.marcaNombre || 'Sin marca'}</span>
        ${producto.genero ? `<span>• ${producto.genero}</span>` : ''}
      </div>

      <p class="text-gray-600 text-sm mb-3 line-clamp-2">${producto.descripcion || 'Sin descripción disponible'}</p>

      <div class="flex items-center justify-between mb-3">
        <div class="flex flex-col">
          ${enPromocion && precioCatalogo > 0 ? `
            <span class="text-sm text-gray-500 line-through">S/ ${precioCatalogo.toFixed(2)}</span>
          ` : ''}
          <span class="text-2xl font-bold ${enPromocion ? 'text-red-600' : 'text-pink-600'}">
            S/ ${precioVenta.toFixed(2)}
          </span>
          ${enPromocion ? `
            <span class="text-xs text-green-600 font-semibold">¡Ahorra S/ ${(precioCatalogo - precioVenta).toFixed(2)}!</span>
          ` : ''}
        </div>
        
        <button class="whatsapp-btn flex items-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed" 
                onclick="abrirWhatsApp('${producto.nombre.replace(/'/g, "\\'")}')"
                title="Consultar por WhatsApp">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
          </svg>
          Consultar
        </button>
      </div>

      ${stock !== undefined ? `
        <div class="stock-indicator ${stockClass} text-xs text-gray-500 border-l-2 border-gray-300 pl-3">
          📦 Stock: ${stockText}
        </div>
      ` : ''}
    </div>
  `;

  return card;
}

/**
 * 🎨 Renderizar productos optimizado
 */
async function renderizarProductos(docs) {
  const elementos = getElementos();
  elementos.productos.innerHTML = "";
  estadoApp.totalProductosMostrados = 0;

  // Aplicar filtro de búsqueda
  let docsFiltrados = docs;
  if (estadoApp.filtrosActivos.search) {
    docsFiltrados = docs.filter(doc => {
      const producto = doc.data();
      const textosBusqueda = [
        producto.nombre || '',
        producto.descripcion || '',
        producto.categoriaNombre || '',
        producto.marcaNombre || ''
      ].map(texto => texto.toLowerCase());
      
      return textosBusqueda.some(texto => texto.includes(estadoApp.filtrosActivos.search));
    });
  }

  if (docsFiltrados.length === 0) {
    if (estadoApp.filtrosActivos.search) {
      await realizarBusquedaInteligente(estadoApp.filtrosActivos.search);
      return;
    }
    mostrarProductosVacios();
    return;
  }

  // Usar requestAnimationFrame para mejor rendimiento
  const renderBatch = (startIndex = 0) => {
    const batchSize = 10;
    const endIndex = Math.min(startIndex + batchSize, docsFiltrados.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      const doc = docsFiltrados[i];
      const producto = doc.data();
      producto.id = doc.id;
      
      const card = crearTarjetaProducto(producto);
      elementos.productos.appendChild(card);
      estadoApp.totalProductosMostrados++;
    }
    
    if (endIndex < docsFiltrados.length) {
      requestAnimationFrame(() => renderBatch(endIndex));
    } else {
      // Finalizar renderizado
      elementos.totalProductos.textContent = estadoApp.totalProductosMostrados;
      elementos.noProductos.classList.add("hidden");
      elementos.productos.classList.remove("hidden");
    }
  };

  requestAnimationFrame(() => renderBatch());
}

/**
 * 🎨 Renderizar productos del buffer
 */
async function renderizarProductosBuffer(docs) {
  const elementos = getElementos();
  elementos.productos.innerHTML = "";
  estadoApp.totalProductosMostrados = 0;

  if (docs.length === 0) {
    mostrarProductosVacios();
    return;
  }

  // Renderizado optimizado
  const fragment = document.createDocumentFragment();
  
  docs.forEach(doc => {
    const producto = doc.data();
    producto.id = doc.id;
    const card = crearTarjetaProducto(producto);
    fragment.appendChild(card);
    estadoApp.totalProductosMostrados++;
  });

  elementos.productos.appendChild(fragment);
  elementos.totalProductos.textContent = `${estadoApp.totalProductosMostrados} de ${estadoApp.productosBuffer.length}`;
  elementos.noProductos.classList.add("hidden");
  elementos.productos.classList.remove("hidden");
}

// =================================
//      FUNCIONES DE UTILIDAD
// =================================

/**
 * ⏳ Mostrar/ocultar loading
 */
function mostrarLoading(mostrar) {
  const elementos = getElementos();
  elementos.loading.classList.toggle("hidden", !mostrar);
  elementos.productos.classList.toggle("hidden", mostrar);
  elementos.noProductos.classList.add("hidden");
}

/**
 * 🔍 Mostrar productos vacíos
 */
function mostrarProductosVacios() {
  const elementos = getElementos();
  elementos.productos.classList.add("hidden");
  elementos.noProductos.classList.remove("hidden");
  elementos.totalProductos.textContent = "0";
  estadoApp.totalProductosMostrados = 0;
}

/**
 * ⚠️ Mostrar error
 */
function mostrarError() {
  const elementos = getElementos();
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
 * 📢 Sistema de notificaciones optimizado
 */
function mostrarNotificacion(mensaje, tipo = 'info') {
  // Evitar spam de notificaciones
  if (document.querySelector('.notification-toast')) return;
  
  const notificacion = document.createElement('div');
  notificacion.className = `notification-toast fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full max-w-sm`;
  
  const colores = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white'
  };
  
  notificacion.className += ` ${colores[tipo]}`;
  notificacion.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="flex-1">${mensaje}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-2 hover:opacity-75 text-lg">
        ✕
      </button>
    </div>
  `;
  
  document.body.appendChild(notificacion);
  
  // Animación de entrada
  requestAnimationFrame(() => {
    notificacion.classList.remove('translate-x-full');
  });
  
  // Auto-ocultar
  setTimeout(() => {
    if (notificacion.parentNode) {
      notificacion.classList.add('translate-x-full');
      setTimeout(() => notificacion.remove(), 300);
    }
  }, 3000);
}

/**
 * 🚀 Función debounce optimizada
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 🔄 Resetear paginación
 */
function resetearPaginacion() {
  estadoApp.ultimoDoc = null;
  estadoApp.primerDoc = null;
  estadoApp.paginaActual = 1;
  estadoApp.modoBuffer = false;
  estadoApp.productosBuffer = [];
  estadoApp.indiceBuffer = 0;
  
  const elementos = getElementos();
  elementos.paginaActual.textContent = estadoApp.paginaActual;
  cargarProductos("reset");
}

/**
 * 🎮 Actualizar estado paginación
 */
function actualizarEstadoPaginacion(cantidadDocs) {
  const elementos = getElementos();
  elementos.prev.disabled = estadoApp.paginaActual <= 1;
  elementos.next.disabled = cantidadDocs < CONFIG.PRODUCTOS_POR_PAGINA;
  elementos.paginaActual.textContent = estadoApp.paginaActual;
}

/**
 * 🎮 Actualizar paginación buffer
 */
function actualizarEstadoPaginacionBuffer() {
  const totalPaginas = Math.ceil(estadoApp.productosBuffer.length / CONFIG.PRODUCTOS_POR_PAGINA);
  const elementos = getElementos();
  
  elementos.prev.disabled = estadoApp.paginaActual <= 1;
  elementos.next.disabled = estadoApp.paginaActual >= totalPaginas;
  elementos.paginaActual.textContent = `${estadoApp.paginaActual} de ${totalPaginas}`;
}

/**
 * 📚 Cargar productos principal
 */
async function cargarProductos(direccion = "first") {
  // Manejar modo buffer
  if (estadoApp.modoBuffer && direccion !== "reset" && direccion !== "first") {
    navegarBuffer(direccion);
    return;
  }
  
  // Resetear buffer si es necesario
  if (estadoApp.modoBuffer && (direccion === "reset" || direccion === "first")) {
    estadoApp.modoBuffer = false;
    estadoApp.productosBuffer = [];
    estadoApp.indiceBuffer = 0;
  }
  
  mostrarLoading(true);
  
  try {
    if (direccion === "first" || direccion === "reset") {
      estadoApp.filtrosActivos = obtenerFiltros();
      estadoApp.paginaActual = 1;
      estadoApp.ultimoDoc = null;
      estadoApp.primerDoc = null;
    }

    // Verificar caché
    const cacheKey = cache.generarClave({ ...estadoApp.filtrosActivos, direccion, pagina: estadoApp.paginaActual });
    const cached = cache.obtener(cacheKey);
    
    if (cached && direccion === "first") {
      await renderizarProductos(cached);
      actualizarEstadoPaginacion(cached.length);
      return;
    }

    const q = construirQuery(direccion);
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      if (direccion === "first" || direccion === "reset") {
        mostrarProductosVacios();
      }
      return;
    }

    // Manejar documentos para paginación
    estadoApp.primerDoc = snapshot.docs[0];
    estadoApp.ultimoDoc = snapshot.docs[snapshot.docs.length - 1];

    if (direccion === "next") {
      estadoApp.paginaActual++;
    } else if (direccion === "prev") {
      estadoApp.paginaActual--;
    }

    // Guardar en caché
    if (direccion === "first") {
      cache.guardar(cacheKey, snapshot.docs);
    }

    await renderizarProductos(snapshot.docs);
    actualizarEstadoPaginacion(snapshot.docs.length);
    
  } catch (error) {
    console.error("Error cargando productos:", error);
    mostrarError();
    mostrarNotificacion('❌ Error al cargar productos', 'error');
  } finally {
    mostrarLoading(false);
  }
}

/**
 * 🔄 Navegar en buffer
 */
function navegarBuffer(direccion) {
  if (direccion === "next") {
    const siguienteIndice = estadoApp.indiceBuffer + CONFIG.PRODUCTOS_POR_PAGINA;
    if (siguienteIndice < estadoApp.productosBuffer.length) {
      estadoApp.indiceBuffer = siguienteIndice;
      estadoApp.paginaActual++;
      mostrarPaginaBuffer();
    }
  } else if (direccion === "prev") {
    const anteriorIndice = estadoApp.indiceBuffer - CONFIG.PRODUCTOS_POR_PAGINA;
    if (anteriorIndice >= 0) {
      estadoApp.indiceBuffer = anteriorIndice;
      estadoApp.paginaActual--;
      mostrarPaginaBuffer();
    }
  }
}

/**
 * 🧹 Limpiar filtros
 */
function limpiarFiltros() {
  const elementos = getElementos();
  elementos.search.value = "";
  elementos.categoria.value = "";
  elementos.marca.value = "";
  elementos.genero.value = "";
  elementos.orden.value = "asc";
  
  cache.limpiar();
  localStorage.removeItem('filtrosTienda');
  resetearPaginacion();
}

/**
 * 📝 Cargar opciones de filtros optimizado
 */
async function cargarOpcionesFiltros() {
  try {
    const productosRef = collection(db, "productos");
    const snapshot = await getDocs(productosRef);
    
    const opciones = {
      categorias: new Set(),
      marcas: new Set(),
      generos: new Set()
    };
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.categoriaNombre) opciones.categorias.add(data.categoriaNombre);
      if (data.marcaNombre) opciones.marcas.add(data.marcaNombre);
      if (data.genero) opciones.generos.add(data.genero);
    });
    
    const elementos = getElementos();
    
    // Llenar selectores de forma optimizada
    const llenarSelect = (select, opciones, placeholder) => {
      const fragment = document.createDocumentFragment();
      
      // Agregar opción por defecto
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = placeholder;
      fragment.appendChild(defaultOption);
      
      // Ordenar y agregar opciones
      [...opciones].sort().forEach(opcion => {
        const option = document.createElement('option');
        option.value = opcion;
        option.textContent = opcion;
        fragment.appendChild(option);
      });
      
      select.innerHTML = '';
      select.appendChild(fragment);
    };
    
    llenarSelect(elementos.categoria, opciones.categorias, 'Todas las categorías');
    llenarSelect(elementos.marca, opciones.marcas, 'Todas las marcas');
    llenarSelect(elementos.genero, opciones.generos, 'Todos los géneros');
    
  } catch (error) {
    console.error("Error cargando opciones de filtros:", error);
    mostrarNotificacion('⚠️ Error cargando filtros', 'error');
  }
}

/**
 * 💾 Guardar estado de filtros
 */
function guardarEstadoFiltros() {
  try {
    const filtros = obtenerFiltros();
    localStorage.setItem('filtrosTienda', JSON.stringify(filtros));
  } catch (error) {
    console.error("Error guardando filtros:", error);
  }
}

/**
 * 📂 Cargar estado de filtros
 */
function cargarEstadoFiltros() {
  try {
    const filtrosGuardados = localStorage.getItem('filtrosTienda');
    if (filtrosGuardados) {
      const filtros = JSON.parse(filtrosGuardados);
      const elementos = getElementos();
      
      elementos.search.value = filtros.search || '';
      elementos.categoria.value = filtros.categoria || '';
      elementos.marca.value = filtros.marca || '';
      elementos.genero.value = filtros.genero || '';
      elementos.orden.value = filtros.orden || 'asc';
    }
  } catch (error) {
    console.error("Error cargando estado de filtros:", error);
    localStorage.removeItem('filtrosTienda');
  }
}

/**
 * 📱 Detectar dispositivo móvil
 */
function esMobile() {
  return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 🎨 Optimizar para móvil
 */
function optimizarParaMobile() {
  if (esMobile()) {
    // Reducir animaciones en móviles
    const style = document.createElement('style');
    style.innerHTML = `
      .fade-in { animation-duration: 0.2s !important; }
      .product-card { transition-duration: 0.2s !important; }
      .image-hover-effect img { transition: none !important; }
    `;
    document.head.appendChild(style);
    
    // Optimizar scroll en móvil
    document.documentElement.style.scrollBehavior = 'auto';
  }
}

// =================================
//       EVENT LISTENERS
// =================================

/**
 * 🎛️ Configurar event listeners optimizados
 */
function configurarEventListeners() {
  const elementos = getElementos();
  
  // Búsqueda con debounce optimizado
  const manejarBusqueda = debounce(async (e) => {
    const textoBusqueda = e.target.value.toLowerCase().trim();
    
    if (textoBusqueda === '') {
      resetearPaginacion();
      return;
    }
    
    guardarEstadoFiltros();
    estadoApp.filtrosActivos = obtenerFiltros();
    await realizarBusquedaInteligente(textoBusqueda);
  }, CONFIG.DEBOUNCE_DELAY);
  
  elementos.search.addEventListener("input", manejarBusqueda);
  
  // Filtros con manejo optimizado
  const manejarCambioFiltro = () => {
    guardarEstadoFiltros();
    cache.limpiar(); // Limpiar caché al cambiar filtros
    resetearPaginacion();
  };
  
  elementos.categoria.addEventListener("change", manejarCambioFiltro);
  elementos.marca.addEventListener("change", manejarCambioFiltro);
  elementos.genero.addEventListener("change", manejarCambioFiltro);
  
  // Ordenamiento especial
  elementos.orden.addEventListener("change", () => {
    guardarEstadoFiltros();
    
    if (estadoApp.modoBuffer) {
      // Reordenar buffer
      const orden = elementos.orden.value;
      estadoApp.productosBuffer.sort((a, b) => {
        const precioA = a.data().precioVenta;
        const precioB = b.data().precioVenta;
        return orden === "asc" ? precioA - precioB : precioB - precioA;
      });
      estadoApp.indiceBuffer = 0;
      estadoApp.paginaActual = 1;
      mostrarPaginaBuffer();
    } else {
      cache.limpiar();
      resetearPaginacion();
    }
  });
  
  // Limpiar filtros
  elementos.clearFilters.addEventListener("click", limpiarFiltros);

  // Navegación optimizada
  elementos.next.addEventListener("click", () => {
    if (!elementos.next.disabled) {
      cargarProductos("next");
    }
  });

  elementos.prev.addEventListener("click", () => {
    if (!elementos.prev.disabled && estadoApp.paginaActual > 1) {
      cargarProductos("prev");
    }
  });
  
  // Atajos de teclado
  document.addEventListener('keydown', (e) => {
    // Solo si no hay inputs activos
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
      switch (e.key) {
        case 'ArrowLeft':
          if (!elementos.prev.disabled) elementos.prev.click();
          break;
        case 'ArrowRight':
          if (!elementos.next.disabled) elementos.next.click();
          break;
        case 'Escape':
          limpiarFiltros();
          break;
      }
    }
    
    // Ctrl/Cmd + K para búsqueda
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      elementos.search.focus();
    }
  });
  
  // Optimización de scroll para móvil
  if (esMobile()) {
    let ticking = false;
    
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          // Lógica de scroll optimizada para móvil
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }
}

// =================================
//     FUNCIONES ADICIONALES
// =================================

/**
 * 🎤 Búsqueda por voz (opcional)
 */
function iniciarBusquedaPorVoz() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    mostrarNotificacion('❌ Tu navegador no soporta reconocimiento de voz', 'error');
    return;
  }

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
    const elementos = getElementos();
    elementos.search.value = transcript;
    
    mostrarNotificacion(`🔍 Buscando: "${transcript}"`, 'success');
    
    estadoApp.filtrosActivos = obtenerFiltros();
    await realizarBusquedaInteligente(transcript.toLowerCase().trim());
  };
  
  recognition.onerror = (event) => {
    console.error('Error en reconocimiento:', event.error);
    mostrarNotificacion('❌ Error en reconocimiento de voz', 'error');
  };
  
  recognition.start();
}

/**
 * 📊 Exportar productos actuales
 */
function exportarProductos() {
  try {
    const productosActuales = Array.from(document.querySelectorAll('.product-card')).map(card => {
      const nombre = card.querySelector('h3').textContent.trim();
      const precio = card.querySelector('.text-pink-600, .text-red-600').textContent.trim();
      const categoria = card.querySelector('.glass-effect').textContent.trim();
      
      return { nombre, precio, categoria };
    });
    
    if (productosActuales.length === 0) {
      mostrarNotificacion('❌ No hay productos para exportar', 'error');
      return;
    }
    
    const csv = 'Nombre,Precio,Categoría\n' + 
      productosActuales.map(p => `"${p.nombre}","${p.precio}","${p.categoria}"`).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.href = url;
    a.download = `productos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    mostrarNotificacion('📊 Lista exportada correctamente', 'success');
    
  } catch (error) {
    console.error('Error exportando:', error);
    mostrarNotificacion('❌ Error al exportar', 'error');
  }
}

function resaltarTexto(texto, busqueda) {
  if (!busqueda || !texto) return texto;
  
  const regex = new RegExp(`(${busqueda.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return texto.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
}

// =================================
//       INICIALIZACIÓN
// =================================

/**
 * 🚀 Inicializar aplicación
 */
async function inicializarApp() {
  try {
    mostrarLoading(true);
    
    // Optimizar para móvil primero
    optimizarParaMobile();
    
    // Configurar event listeners
    configurarEventListeners();
    
    // Cargar opciones de filtros
    await cargarOpcionesFiltros();
    
    // Cargar estado guardado
    cargarEstadoFiltros();
    
    // Determinar si hay búsqueda inicial
    const filtrosIniciales = obtenerFiltros();
    estadoApp.filtrosActivos = filtrosIniciales;
    
    if (filtrosIniciales.search) {
      await realizarBusquedaInteligente(filtrosIniciales.search);
    } else {
      await cargarProductos("first");
    }
    
  } catch (error) {
    console.error("❌ Error inicializando app:", error);
    mostrarError();
    mostrarNotificacion('❌ Error al cargar la aplicación', 'error');
  } finally {
    mostrarLoading(false);
  }
}

// =================================
//    EVENTOS DE CARGA
// =================================

// Inicializar cuando esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarApp);
} else {
  inicializarApp();
}

// Manejo de errores globales
window.addEventListener('error', (e) => {
  console.error('Error global:', e.error);
  mostrarNotificacion('❌ Ocurrió un error inesperado', 'error');
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Promesa rechazada:', e.reason);
  mostrarNotificacion('❌ Error de conexión', 'error');
  e.preventDefault();
});

// Optimización de rendimiento
window.addEventListener('beforeunload', () => {
  cache.limpiar();
});

// Manejar visibilidad de página para optimización
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Pausar operaciones pesadas cuando la página no es visible
    cache.limpiar();
  }
});

// =================================
//    FUNCIONES GLOBALES EXPUESTAS
// =================================

// Exponer funciones necesarias globalmente
window.abrirWhatsApp = abrirWhatsApp;
window.iniciarBusquedaPorVoz = iniciarBusquedaPorVoz;
window.exportarProductos = exportarProductos;
window.cargarProductos = cargarProductos;
window.limpiarFiltros = limpiarFiltros;

// Exponer para desarrollo/debug (solo en desarrollo)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.debug = {
    estado: estadoApp,
    cache: cache,
    config: CONFIG
  };
}