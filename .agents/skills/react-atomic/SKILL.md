---
name: React Atomic Design
description: Reglas y directrices para construir interfaces de usuario utilizando la metodología Atomic Design en React.
---

# Metodología React Atomic Design

Al desarrollar interfaces en este proyecto, DEBES adherirte a los principios de Atomic Design.

## Estructura de Carpetas

Todo el código de UI debe residir en `src/components/` subdividido en:

- `atoms/`: Componentes indivisibles. No pueden tener dependencias de otros componentes de UI. (ej. Botones, Inputs, Textos).
- `molecules/`: Grupos simples de átomos que funcionan juntos como una unidad. (ej. Un campo de formulario: Label + Input + ErrorMessage).
- `organisms/`: Componentes de UI complejos que forman secciones completas de la interfaz. Pueden contener moléculas y átomos. (ej. Barra de navegación, Tabla de Gaps).
- `templates/`: Componentes que definen la estructura (layout) de una página sin proporcionar el contenido final.
- `pages/`: Vistas específicas que inyectan el estado de la aplicación y datos reales en los templates.

## Reglas de Implementación

1. **Aislamiento:** Los átomos y moléculas NUNCA deben estar acoplados al estado global de la aplicación (Redux, Context) ni hacer llamadas a APIs. Deben recibir todos sus datos vía "props".
2. **Estilos:** Usa CSS Modules o Vanilla CSS importado localmente. Cada componente debe tener sus propios estilos encapsulados.
3. **Páginas Inteligentes (Smart Components):** Solo las `pages` o `organisms` de muy alto nivel deben encargarse de la lógica de negocio (llamar APIs, gestionar configuración).
4. **Exportaciones:** Cada carpeta (ej. `atoms/Button`) debe tener un `index.js` o `index.tsx` para facilitar la importación limpia.
