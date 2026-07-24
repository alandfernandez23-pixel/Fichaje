# Fichaje — App de entrada y salida

Sistema completo y gratuito de fichaje:

- **`mobile/`** — App Flutter (Android + iOS). Login con Google, botón de huella
  para fichar entrada/salida (verde = fichado, rojo = afuera).
- **`admin-web/`** — Panel web en React. Ve todos los fichajes en tiempo real
  (fecha, hora, minuto, segundo) y descarga un Excel para liquidaciones.
- **`firebase/`** — Reglas de seguridad y configuración que conectan ambas apps
  a la misma base de datos.

Todo corre sobre el plan gratuito de Firebase (Spark), que alcanza de sobra
para un grupo chico o mediano.

---

## Paso 1 — Crear el proyecto en Firebase

1. Entrá a [console.firebase.google.com](https://console.firebase.google.com) y creá un proyecto nuevo (ej: "fichaje-scouts").
2. En **Compilación → Authentication**, activá el proveedor **Google**.
3. En **Compilación → Firestore Database**, creá la base de datos (modo producción, región `southamerica-east1` es una buena opción para Argentina).

## Paso 2 — Conectar la app de celular (Flutter)

Necesitás tener instalado [Flutter](https://docs.flutter.dev/get-started/install) y la [Firebase CLI](https://firebase.google.com/docs/cli#install_the_firebase_cli).

```bash
cd mobile
npm install -g firebase-tools   # si no la tenés
dart pub global activate flutterfire_cli
flutterfire configure
```

`flutterfire configure` te va a pedir elegir tu proyecto de Firebase y las
plataformas (Android, iOS). Esto reemplaza automáticamente el archivo
`lib/firebase_options.dart` con tus credenciales reales.

Después:

```bash
flutter pub get
flutter run
```

**Importante para el login de Google:** en Android necesitás agregar la huella
digital SHA-1 de tu build a Firebase (te lo pide `flutterfire configure` o lo
podés sacar con `cd android && ./gradlew signingReport`). En iOS necesitás
agregar el `REVERSED_CLIENT_ID` al `Info.plist` (el propio Firebase te da las
instrucciones exactas al bajar el `GoogleService-Info.plist`).

## Paso 3 — Conectar el panel web (React)

```bash
cd admin-web
npm install
```

Abrí `src/firebase.js` y pegá ahí la configuración de tu proyecto web:
en la consola de Firebase, andá a **Configuración del proyecto → Tus apps →
Agregar app → Web (</>)**, registrala, y copiá el objeto `firebaseConfig`
que te muestra.

Para correrlo en local:

```bash
npm run dev
```

Para publicarlo gratis en Firebase Hosting:

```bash
firebase init hosting   # elegí "usar archivo existente" si pregunta por firebase.json
npm run build
firebase deploy --only hosting
```

## Paso 4 — Definir quién es administrador

Abrí `firebase/firestore.rules` y reemplazá los emails de ejemplo por los
emails reales de las personas que van a poder ver **todos** los fichajes
(no solo el propio):

```js
request.auth.token.email in [
  'tu-email@gmail.com'
]
```

Después subí las reglas:

```bash
cd firebase
firebase deploy --only firestore:rules,firestore:indexes
```

Sin este paso, cualquier usuario logueado solo puede ver su propio historial,
no el de los demás — el panel de admin necesita este cambio para funcionar.

## Paso 5 — Probar todo junto

1. Corré la app de celular, logueate con Google, tocá la huella → se pone
   verde (fichaste entrada). Tocala de nuevo → se pone roja (fichaste salida).
2. Abrí el panel web, logueate con un email que hayas puesto como admin, y
   deberías ver esa entrada y salida con fecha, hora, minuto y segundo.
3. Tocá "Descargar Excel" para bajar la planilla lista para liquidaciones.

---

## Cómo están guardados los datos

Cada fichaje es un documento en la colección `fichajes` de Firestore:

```
{
  uid: "id del usuario",
  nombre: "Nombre Apellido",
  email: "persona@gmail.com",
  horaEntrada: <timestamp con fecha, hora, minuto y segundo>,
  horaSalida: <timestamp igual, o null si todavía no fichó salida>
}
```

Firestore guarda el timestamp con precisión de milisegundos, así que la
información para las liquidaciones va a ser exacta.

## Límites del plan gratuito (Spark)

- 50.000 lecturas y 20.000 escrituras por día.
- Un fichaje = 1 escritura (entrada) + 1 escritura (salida) + un puñado de
  lecturas en el panel. Para decenas de personas fichando todos los días,
  no te acercás al límite.
