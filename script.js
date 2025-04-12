

const DB_NAME = "ImagenesUltraSecureDB";
const STORE_NAME = "imagenesStore";
let cryptoKey = null;

// Derivar clave AES desde el PIN
async function derivarClave(pin) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(pin),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("ultra-sal"), // Sal fija para demo
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// Abrir la base de datos
function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject("Error al abrir IndexedDB");
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        };
    });
}

// Encriptar y comprimir los IDs (array de strings)
async function guardarIds(ids) {
    const texto = JSON.stringify(ids);
    const comprimido = LZString.compressToUint8Array(texto);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const cifrado = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        cryptoKey,
        comprimido
    );

    const db = await abrirDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await store.put({ id: 1, data: cifrado, iv: Array.from(iv) });
}

// Leer, desencriptar y descomprimir los IDs
async function obtenerIds() {
    const db = await abrirDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(1);
    return new Promise((resolve, reject) => {
        req.onsuccess = async () => {
            const resultado = req.result;
            if (!resultado) return resolve([]);
            const iv = new Uint8Array(resultado.iv);
            try {
                const descifrado = await window.crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: iv },
                    cryptoKey,
                    resultado.data
                );
                const decomprimido = LZString.decompressFromUint8Array(new Uint8Array(descifrado));
                resolve(JSON.parse(decomprimido));
            } catch {
                resolve([]);
            }
        };
        req.onerror = () => reject("Error al leer los datos");
    });
}

// Agregar nuevo ID y guardar
async function agregarId(id) {
    const ids = await obtenerIds();
    ids.push(id);
    await guardarIds(ids);
}

// Mostrar imágenes reconstruyendo URL
async function mostrarImagenes() {
    const galeria = document.getElementById("galeria");
    galeria.innerHTML = "";
    const ids = await obtenerIds();
    ids.forEach(id => {
        const img = document.createElement("img");
        img.src = `https://i.imgur.com/${id}.jpg`;
        img.style.width = "200px";
        img.style.margin = "10px";
        galeria.appendChild(img);
    });
}

// Subida a Imgur
async function subirImagen() {
    const input = document.getElementById("imageInput");
    if (!input.files.length) return alert("Selecciona una imagen");

    const formData = new FormData();
    formData.append("image", input.files[0]);

    const clientId = "TU_CLIENT_ID_DE_IMGUR";
    const res = await fetch("https://api.imgur.com/3/image", {
        method: "POST",
        headers: { Authorization: `Client-ID ${clientId}` },
        body: formData
    });

    const data = await res.json();
    if (data.success) {
        const id = data.data.link.match(/\/([a-zA-Z0-9]+)\./)[1];
        await agregarId(id);
        await mostrarImagenes();
    } else {
        alert("Error al subir imagen");
    }
}

// Solicitar PIN al iniciar
window.onload = async () => {
    const pin = prompt("Ingresa tu PIN para acceder:");
    if (!pin) return alert("PIN requerido");

    cryptoKey = await derivarClave(pin);
    mostrarImagenes();
};