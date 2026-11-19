/**
 * ============================================================================
 *  CAPA DE NEGOCIO · IA · Red neuronal (perceptrón multicapa) hecha desde cero
 * ----------------------------------------------------------------------------
 *  No usa librerías: todo el cálculo está aquí para poder explicarlo.
 *
 *  Estructura:  entradas -> capa oculta 1 (tanh) -> capa oculta 2 (tanh) -> salida (lineal)
 *
 *  1. Propagación hacia adelante: cada neurona calcula  z = Σ(peso · entrada) + sesgo
 *     y aplica la activación tanh(z). La salida es lineal (un número: demanda).
 *  2. Error: error cuadrático medio (MSE) entre lo predicho y lo real.
 *  3. Retropropagación: con la regla de la cadena se calcula cuánto aportó
 *     cada peso al error (gradiente).
 *  4. Optimización Adam: ajusta cada peso un poco en contra de su gradiente.
 *  Se repite durante varias épocas hasta que el error baja.
 * ============================================================================
 */

/** Generador pseudoaleatorio con semilla (resultados reproducibles). */
function generadorAleatorio(semilla = 42) {
    let t = semilla >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

const matriz = (filas, columnas, fn) => Array.from({ length: filas }, (_, i) => Array.from({ length: columnas }, (_, j) => fn(i, j)));
const ceros = (filas, columnas) => matriz(filas, columnas, () => 0);

class RedNeuronal {
    /**
     * @param {number}   entradas  cantidad de variables de entrada
     * @param {number[]} ocultas   neuronas por capa oculta, ej. [12, 8]
     * @param {number}   semilla   para inicializar los pesos siempre igual
     */
    constructor({ entradas, ocultas = [12, 8], semilla = 42 }) {
        this.tamanos = [entradas, ...ocultas, 1];
        const aleatorio = generadorAleatorio(semilla);
        // Inicialización de Xavier: pesos pequeños según el tamaño de la capa
        this.pesos = [];
        this.sesgos = [];
        for (let c = 0; c < this.tamanos.length - 1; c++) {
            const nEntrada = this.tamanos[c];
            const nSalida = this.tamanos[c + 1];
            const limite = Math.sqrt(6 / (nEntrada + nSalida));
            this.pesos.push(matriz(nSalida, nEntrada, () => (aleatorio() * 2 - 1) * limite));
            this.sesgos.push(new Array(nSalida).fill(0));
        }
    }

    get arquitectura() {
        return this.tamanos.join('-');
    }

    /** Propagación hacia adelante. Devuelve las activaciones de todas las capas. */
    propagar(x) {
        const activaciones = [x];
        for (let c = 0; c < this.pesos.length; c++) {
            const entrada = activaciones[c];
            const esSalida = c === this.pesos.length - 1;
            const salida = this.pesos[c].map((filaPesos, j) => {
                let z = this.sesgos[c][j];
                for (let i = 0; i < filaPesos.length; i++) z += filaPesos[i] * entrada[i];
                return esSalida ? z : Math.tanh(z);
            });
            activaciones.push(salida);
        }
        return activaciones;
    }

    predecir(x) {
        const a = this.propagar(x);
        return a[a.length - 1][0];
    }

    /**
     * Entrena con retropropagación + Adam.
     * @returns {{epocas:number, errorInicial:number, errorFinal:number, historial:number[]}}
     */
    entrenar(X, Y, { epocas = 600, tasa = 0.01, lote = 16, semilla = 7 } = {}) {
        const aleatorio = generadorAleatorio(semilla);
        const b1 = 0.9; const b2 = 0.999; const eps = 1e-8;
        const mP = this.pesos.map(p => ceros(p.length, p[0].length));
        const vP = this.pesos.map(p => ceros(p.length, p[0].length));
        const mS = this.sesgos.map(s => new Array(s.length).fill(0));
        const vS = this.sesgos.map(s => new Array(s.length).fill(0));
        let paso = 0;
        const historial = [];
        const indices = X.map((_, i) => i);

        const errorMedio = () => X.reduce((acc, x, i) => acc + (this.predecir(x) - Y[i]) ** 2, 0) / X.length;
        const errorInicial = errorMedio();

        for (let epoca = 0; epoca < epocas; epoca++) {
            // Barajar los ejemplos en cada época
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(aleatorio() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            for (let inicio = 0; inicio < indices.length; inicio += lote) {
                const grupo = indices.slice(inicio, inicio + lote);
                const gP = this.pesos.map(p => ceros(p.length, p[0].length));
                const gS = this.sesgos.map(s => new Array(s.length).fill(0));

                for (const k of grupo) {
                    const act = this.propagar(X[k]);
                    // Error en la salida (derivada del MSE)
                    let delta = [2 * (act[act.length - 1][0] - Y[k])];
                    for (let c = this.pesos.length - 1; c >= 0; c--) {
                        const entrada = act[c];
                        for (let j = 0; j < delta.length; j++) {
                            gS[c][j] += delta[j];
                            for (let i = 0; i < entrada.length; i++) gP[c][j][i] += delta[j] * entrada[i];
                        }
                        if (c > 0) {
                            // Regla de la cadena hacia la capa anterior (derivada de tanh = 1 - a²)
                            const anterior = new Array(entrada.length).fill(0);
                            for (let i = 0; i < entrada.length; i++) {
                                let suma = 0;
                                for (let j = 0; j < delta.length; j++) suma += this.pesos[c][j][i] * delta[j];
                                anterior[i] = suma * (1 - entrada[i] * entrada[i]);
                            }
                            delta = anterior;
                        }
                    }
                }

                // Actualización Adam
                paso++;
                const corr1 = 1 - b1 ** paso;
                const corr2 = 1 - b2 ** paso;
                for (let c = 0; c < this.pesos.length; c++) {
                    for (let j = 0; j < this.pesos[c].length; j++) {
                        for (let i = 0; i < this.pesos[c][j].length; i++) {
                            const g = gP[c][j][i] / grupo.length;
                            mP[c][j][i] = b1 * mP[c][j][i] + (1 - b1) * g;
                            vP[c][j][i] = b2 * vP[c][j][i] + (1 - b2) * g * g;
                            this.pesos[c][j][i] -= tasa * (mP[c][j][i] / corr1) / (Math.sqrt(vP[c][j][i] / corr2) + eps);
                        }
                        const g = gS[c][j] / grupo.length;
                        mS[c][j] = b1 * mS[c][j] + (1 - b1) * g;
                        vS[c][j] = b2 * vS[c][j] + (1 - b2) * g * g;
                        this.sesgos[c][j] -= tasa * (mS[c][j] / corr1) / (Math.sqrt(vS[c][j] / corr2) + eps);
                    }
                }
            }
            if (epoca % 50 === 0 || epoca === epocas - 1) historial.push(Number(errorMedio().toFixed(6)));
        }
        return { epocas, errorInicial, errorFinal: errorMedio(), historial };
    }

    /** Para guardar el modelo en la base de datos (tabla modelos_ia). */
    aJSON() {
        return { tamanos: this.tamanos, pesos: this.pesos, sesgos: this.sesgos };
    }

    static desdeJSON(datos) {
        const red = new RedNeuronal({ entradas: datos.tamanos[0], ocultas: datos.tamanos.slice(1, -1) });
        red.pesos = datos.pesos;
        red.sesgos = datos.sesgos;
        return red;
    }
}

module.exports = { RedNeuronal, generadorAleatorio };
