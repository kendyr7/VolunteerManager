# FASE A.2 — MATRIZ HUMANA DE RECONCILIACIÓN
**Fecha de Diagnóstico**: 2026-08-08T01:22:28.542Z

> [!IMPORTANT]
> **INTEGRIDAD DE DATOS (CERO MUTACIONES)**:
> * **VOLUNTARIOS MODIFICADOS**: `0`
> * **REVIEWS MODIFICADOS**: `0`
> * **REVIEW ITEMS MODIFICADOS**: `0`
> * **ACTIVITY LOGS MODIFICADOS**: `0`
> * **ESTADO**: Cero decisiones nuevas ejecutadas en base de datos.

---
## 1. 24 ÍTEMS YA PROCESADOS
Total de registros en estado `PROCESSED`: `0`

| Volunteer ID | Nombre Completo | Teléfono Anterior | Teléfono Actual | Phone Normalized | Is Shared | Owner Nombre | Decisión Original | Corrected Phone | Status Proc. | Procesado Por | Comentario | Cambio Concreto Realizado |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :---: | :--- | :--- | :--- |

---
## 2. 7 POSIBLES DECISIONES MANUALES
Registros con comentarios administrativos libres registrados por coordinadores humanos. **Evidencia directa sin interpretación automática**:

| Volunteer ID | Nombre | Teléfono Actual | Original Phone | Decisión | Corrected Phone | Comentario del Revisor | Revisor | Reviewed At | Status Item | Review ID |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- | :---: | :--- |
| `09170620...` | Mario Alberto Jimenez Lopez | `+50587713398` | `undefined` | `MANUAL_REVIEW` | `NULL` | **"Mario No es su numero"** | Administrador | Pendiente | `PENDING` | `f52cb81a...` |
| `e23ded61...` | José María Mercado | `+50589005590` | `undefined` | `MANUAL_REVIEW` | `NULL` | **"Jose, no es su numero"** | Administrador | Pendiente | `PENDING` | `d73f0c1c...` |
| `54964c35...` | José Luis Gaitán | `+50583760752` | `undefined` | `MANUAL_REVIEW` | `NULL` | **"Jennyfer , no es su numero. Jose, no es su numero"** | Administrador | Pendiente | `PENDING` | `a77fdd07...` |
| `0627885d...` | Jennyfer del Carmen López Briceño | `+50583760752` | `undefined` | `MANUAL_REVIEW` | `NULL` | **"Jennyfer , no es su numero. Jose, no es su numero"** | Administrador | Pendiente | `PENDING` | `a77fdd07...` |
| `f6d53f0f...` | Ericka Maria Lopez de Jimenez | `+50577977321` | `undefined` | `MANUAL_REVIEW` | `NULL` | **"Ericka no es su numero"** | Administrador | Pendiente | `PENDING` | `3c34d953...` |
| `582734e1...` | Geoconda de los Angeles Olivares Silva | `+50586191864` | `undefined` | `MANUAL_REVIEW` | `NULL` | **"Geoconda , no es su numero"** | Administrador | Pendiente | `PENDING` | `decb070e...` |
| `73af9bb3...` | Janixia Benita Juárez | `+50586263843` | `undefined` | `MANUAL_REVIEW` | `NULL` | **"No es su numero"** | Administrador | Pendiente | `PENDING` | `4d2c1d97...` |

---
## 3. 5 PLANES AUTOMÁTICOS
> ⚠️ **ESTO ES UNA SUGERENCIA AUTOMÁTICA, NO UNA DECISIÓN HUMANA CONFIRMADA.**

| Volunteer ID | Nombre | Teléfono Actual | Decisión Propuesta | Comentario | Status | Processing Status | Review ID |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| `54b5b3d6...` | Sayda Raquel Rubio de Gonzalez | `+50588714650` | `MANUAL_REVIEW` | Decisión individual por voluntario registrada. | `APPROVED` | `PENDING` | `3b3d56c9...` |
| `f2c5361d...` | Victor Salazar | `+50584363933` | `MANUAL_REVIEW` | Decisión individual por voluntario registrada. | `APPROVED` | `PENDING` | `92ea6859...` |
| `f608dccc...` | Mirna Mireya Mendoza de Bravo | `+50586965155` | `MANUAL_REVIEW` | Decisión individual por voluntario registrada. | `APPROVED` | `PENDING` | `b6249897...` |
| `ca31e077...` | Tifany Esther Maradiaga Acosta | `+50584695189` | `MANUAL_REVIEW` | Decisión individual por voluntario registrada. | `APPROVED` | `PENDING` | `19e5688c...` |
| `8bb8975e...` | Ryder Jose Garache Miranda | `+50582569472` | `MANUAL_REVIEW` | Decisión individual por voluntario registrada. | `APPROVED` | `PENDING` | `963a9652...` |

---
## 4. 3 PRUEBAS AUTOMATIZADAS
> 🧪 **ESTE REGISTRO CORRESPONDE A UNA PRUEBA AUTOMATIZADA DE DESARROLLO/TEST.**

| Volunteer ID | Nombre | Decisión | Revisor/Actor | Comentario | Processing Status |
| :--- | :--- | :---: | :--- | :--- | :---: |
| `92710b21...` | Jaquline del Carmen Calderon | `SHARED_PHONE` | `AdminDrevelTester` | Aprobado saneamiento de grupo Drevel / Jaqueline | `PROCESSED` |
| `105ee4b4...` | Drevel jha canel aristhomene forbes | `ARCHIVE_DUPLICATE` | `AdminDrevelTester` | Aprobado saneamiento de grupo Drevel / Jaqueline | `PROCESSED` |
| `3675328e...` | Drevel Jha Canel Aristhomene Forbes | `PHONE_OWNER` | `AdminDrevelTester` | Aprobado saneamiento de grupo Drevel / Jaqueline | `PROCESSED` |

---
## 5. 5 INDETERMINADOS
Registros cuyo origen no puede ser atribuido con certeza absoluta a una acción manual o script:

| Volunteer ID | Nombre | Teléfono | Decisión | Revisor | Comentario | Razón de Indeterminación |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| `f032c7d1...` | Nahomi Paola Ampie Somarriba | `+50587823513` | `PHONE_OWNER` | Administrador | Actualización de decisión para voluntario D | Estado `REJECTED` / `REJECTED` sin metadatos suficientes. |
| `4d7fd9f8...` | Winston Ivan Morales Blandon | `+50587823513` | `ARCHIVE_DUPLICATE` | Administrador | Actualización de decisión para voluntario D | Estado `REJECTED` / `REJECTED` sin metadatos suficientes. |
| `0a3529eb...` | Nataly del Pilar Ampie Somarriba | `+50587823513` | `SHARED_PHONE` | Administrador | Actualización de decisión para voluntario D | Estado `REJECTED` / `REJECTED` sin metadatos suficientes. |
| `c5827f37...` | Zoe de los Angeles Ampie Somarriiba | `+50587823513` | `SHARED_PHONE` | Administrador | Actualización de decisión para voluntario D | Estado `REJECTED` / `REJECTED` sin metadatos suficientes. |
| `64aa3181...` | Sheyla Patricia Blandón Somarriba | `+50587823513` | `PHONE_OWNER` | Administrador | Actualización de decisión para voluntario D | Estado `REJECTED` / `REJECTED` sin metadatos suficientes. |

---
## 6. MATRIZ GLOBAL DE CRUZADO CONTRA `public.volunteers` (44 ÍTEMS)
| volunteer_id | Nombre | Teléfono Actual | Decisión Histórica | Estado Histórico | ¿Procesado? | ¿Parece Prueba? | ¿Parece Manual? |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `f032c7d1...` | Nahomi Paola Ampie Somarriba | `+50587823513` | `PHONE_OWNER` | `REJECTED` | NO | NO | NO |
| `6bf0be0f...` | Matias Spencer Vanegas Blandon | `87771234` | `KEEP` | `PROCESSED` | SÍ | NO | NO |
| `4d7fd9f8...` | Winston Ivan Morales Blandon | `+50587823513` | `ARCHIVE_DUPLICATE` | `REJECTED` | NO | NO | NO |
| `0a3529eb...` | Nataly del Pilar Ampie Somarriba | `+50587823513` | `SHARED_PHONE` | `REJECTED` | NO | NO | NO |
| `09170620...` | Mario Alberto Jimenez Lopez | `+50587713398` | `MANUAL_REVIEW` | `PENDING` | NO | NO | SÍ |
| `2c88bc6d...` | Martha Carolina González Lacayo | `+50587713398` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `19771251...` | Celsa Amparo Chevez Torrez de Salmeron | `+50587727490` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `3b65e88d...` | Nohemy de los Angeles Salmeron Chevez | `78651110` | `SHARED_PHONE` | `PROCESSED` | SÍ | NO | NO |
| `d477963b...` | Maria Auxiliadora Romero Roque | `+50586704253` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `58b4824a...` | Fanny Auxiliadora Fonseca Romero | `77675384` | `SHARED_PHONE` | `PROCESSED` | SÍ | NO | NO |
| `16744c32...` | Silma Herenia De Coronado Chavarria | `+50581233738` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `a258fc80...` | Ericka Camila Coronado Chavarria | `87593640` | `SHARED_PHONE` | `PROCESSED` | SÍ | NO | NO |
| `0cdea6a8...` | Sarah Anali Chavarria Salinas | `+50581233738` | `SHARED_PHONE` | `PROCESSED` | SÍ | NO | NO |
| `ed02a044...` | Carolina Gonzalez | `+50587713398` | `ARCHIVE_DUPLICATE` | `PROCESSED` | SÍ | NO | NO |
| `31fc9b9e...` | Mauricio Celestino Cuarezma Méndez | `+50585857058` | `ARCHIVE_DUPLICATE` | `PROCESSED` | SÍ | NO | NO |
| `6b9d4bc4...` | Mauricio Celestino Cuarezma Mendez | `+50585857058` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `3558ca55...` | Celestino cuaresma Mendez | `+50585857058` | `ARCHIVE_DUPLICATE` | `PROCESSED` | SÍ | NO | NO |
| `f3f4508d...` | Yara Francel Rocha Velásquez | `+50588714650` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `54b5b3d6...` | Sayda Raquel Rubio de Gonzalez | `+50588714650` | `MANUAL_REVIEW` | `PENDING` | NO | NO | NO |
| `e23ded61...` | José María Mercado | `+50589005590` | `MANUAL_REVIEW` | `PENDING` | NO | NO | SÍ |
| `e816e427...` | Juan Rivera Benavides | `+50589005590` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `f2c5361d...` | Victor Salazar | `+50584363933` | `MANUAL_REVIEW` | `PENDING` | NO | NO | NO |
| `60909675...` | Camila Salazar | `+50584363933` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `f608dccc...` | Mirna Mireya Mendoza de Bravo | `+50586965155` | `MANUAL_REVIEW` | `PENDING` | NO | NO | NO |
| `61bede17...` | Nadia Camila Davila de Mejia | `86965155` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `54964c35...` | José Luis Gaitán | `+50583760752` | `MANUAL_REVIEW` | `PENDING` | NO | NO | SÍ |
| `0627885d...` | Jennyfer del Carmen López Briceño | `+50583760752` | `MANUAL_REVIEW` | `PENDING` | NO | NO | SÍ |
| `f6d53f0f...` | Ericka Maria Lopez de Jimenez | `+50577977321` | `MANUAL_REVIEW` | `PENDING` | NO | NO | SÍ |
| `b75ba851...` | Freddy Alfonso Cruz Flores | `+50577977321` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `92710b21...` | Jaquline del Carmen Calderon | `+50588546327` | `SHARED_PHONE` | `PROCESSED` | SÍ | SÍ | NO |
| `105ee4b4...` | Drevel jha canel aristhomene forbes | `+50588546327` | `ARCHIVE_DUPLICATE` | `PROCESSED` | SÍ | SÍ | NO |
| `3675328e...` | Drevel Jha Canel Aristhomene Forbes | `+50588546327` | `PHONE_OWNER` | `PROCESSED` | SÍ | SÍ | NO |
| `ca31e077...` | Tifany Esther Maradiaga Acosta | `+50584695189` | `MANUAL_REVIEW` | `PENDING` | NO | NO | NO |
| `909a4eb7...` | Alisson Nicole Maradiaga Acosta | `+50578403793` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `8e9cf31d...` | Haronyd Daniela Hernández Dávila | `+50586191864` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `582734e1...` | Geoconda de los Angeles Olivares Silva | `+50586191864` | `MANUAL_REVIEW` | `PENDING` | NO | NO | SÍ |
| `516b0553...` | Elianing Magedla Contreras de Garache | `+50588688069` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `8bb8975e...` | Ryder Jose Garache Miranda | `+50582569472` | `MANUAL_REVIEW` | `PENDING` | NO | NO | NO |
| `c8cc7156...` | Jorge Jesus Hernández | `+50586263843` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `73af9bb3...` | Janixia Benita Juárez | `+50586263843` | `MANUAL_REVIEW` | `PENDING` | NO | NO | SÍ |
| `119a7436...` | Camila Mercedes Caceres Picado | `+50578976493` | `SHARED_PHONE` | `PROCESSED` | SÍ | NO | NO |
| `814b1d80...` | Marian Elizabeth Caceres Picado | `+50578976493` | `PHONE_OWNER` | `PROCESSED` | SÍ | NO | NO |
| `c5827f37...` | Zoe de los Angeles Ampie Somarriiba | `+50587823513` | `SHARED_PHONE` | `REJECTED` | NO | NO | NO |
| `64aa3181...` | Sheyla Patricia Blandón Somarriba | `+50587823513` | `PHONE_OWNER` | `REJECTED` | NO | NO | NO |

---
## 7. CONFLICTOS DETECTADOS
| Severidad | ID Voluntario | Nombre | Descripción del Conflicto |
| :---: | :--- | :--- | :--- |
| **BAJO** | `ed02a044...` | Carolina Gonzalez | El ítem figura como PROCESSED pero phone_normalized está NULL en public.volunteers. |
| **BAJO** | `31fc9b9e...` | Mauricio Celestino Cuarezma Méndez | El ítem figura como PROCESSED pero phone_normalized está NULL en public.volunteers. |
| **BAJO** | `3558ca55...` | Celestino cuaresma Mendez | El ítem figura como PROCESSED pero phone_normalized está NULL en public.volunteers. |
| **BAJO** | `105ee4b4...` | Drevel jha canel aristhomene forbes | El ítem figura como PROCESSED pero phone_normalized está NULL en public.volunteers. |

---
## 8. PERSONAS QUE REQUIEREN REVISIÓN HUMANA
Existen **17 voluntariados** cuya decisión no ha sido ejecutada o requiere confirmación en la nueva UI:

1. **Nahomi Paola Ampie Somarriba** (`+50587823513`) - Decisión previa: `PHONE_OWNER` (Comentario: "Actualización de decisión para voluntario D")
2. **Winston Ivan Morales Blandon** (`+50587823513`) - Decisión previa: `ARCHIVE_DUPLICATE` (Comentario: "Actualización de decisión para voluntario D")
3. **Nataly del Pilar Ampie Somarriba** (`+50587823513`) - Decisión previa: `SHARED_PHONE` (Comentario: "Actualización de decisión para voluntario D")
4. **Mario Alberto Jimenez Lopez** (`+50587713398`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Mario No es su numero")
5. **Sayda Raquel Rubio de Gonzalez** (`+50588714650`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Decisión individual por voluntario registrada.")
6. **José María Mercado** (`+50589005590`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Jose, no es su numero")
7. **Victor Salazar** (`+50584363933`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Decisión individual por voluntario registrada.")
8. **Mirna Mireya Mendoza de Bravo** (`+50586965155`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Decisión individual por voluntario registrada.")
9. **José Luis Gaitán** (`+50583760752`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Jennyfer , no es su numero. Jose, no es su numero")
10. **Jennyfer del Carmen López Briceño** (`+50583760752`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Jennyfer , no es su numero. Jose, no es su numero")
11. **Ericka Maria Lopez de Jimenez** (`+50577977321`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Ericka no es su numero")
12. **Tifany Esther Maradiaga Acosta** (`+50584695189`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Decisión individual por voluntario registrada.")
13. **Geoconda de los Angeles Olivares Silva** (`+50586191864`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Geoconda , no es su numero")
14. **Ryder Jose Garache Miranda** (`+50582569472`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "Decisión individual por voluntario registrada.")
15. **Janixia Benita Juárez** (`+50586263843`) - Decisión previa: `MANUAL_REVIEW` (Comentario: "No es su numero")
16. **Zoe de los Angeles Ampie Somarriiba** (`+50587823513`) - Decisión previa: `SHARED_PHONE` (Comentario: "Actualización de decisión para voluntario D")
17. **Sheyla Patricia Blandón Somarriba** (`+50587823513`) - Decisión previa: `PHONE_OWNER` (Comentario: "Actualización de decisión para voluntario D")

---
## 9. DATOS A PRESERVAR VS NO REUTILIZAR
### 🟢 DATOS A PRESERVAR:
- Los **7 comentarios libres** de la UI (*"Mario No es su numero"*, *"Jose, no es su numero"*, etc.), como evidencia directa de que el teléfono no pertenece a la persona.
- Los **24 registros procesados** en `volunteers` (se mantienen intactos con su `phone_normalized` y `is_shared_phone`).

### 🔴 DATOS QUE NO DEBEMOS REUTILIZAR AUTOMÁTICAMENTE:
- Las **3 decisiones provenientes de pruebas automatizadas** de scripts (`AdminDrevelTester`, etc.).
- Las sugerencias algorítmicas de los **5 planes automáticos** como si fuesen decisiones finales aprobadas.

===========================================================
FASE A.2: COMPLETE
VOLUNTEERS MODIFICADOS: 0
REVIEWS MODIFICADOS: 0
REVIEW ITEMS MODIFICADOS: 0
ACTIVITY LOGS MODIFICADOS: 0
===========================================================