import * as THREE from 'three';

export function exportToOBJ(group: THREE.Group, seed: number) {
  let output = "# Biopunk Procedural NURBS Spaceship OBJ Export\n";
  output += `# Seed: ${seed}\n`;
  output += `# Generator: GENESIS-X Bio-NURBS Engine v5.0\n\n`;
  let vertexOffset = 1;

  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) {
      const mesh = child as THREE.Mesh;
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);

      const posAttr = geo.attributes.position;
      if (!posAttr) return;

      const rawName = mesh.userData?.name || 'BioMesh';
      const cleanName = rawName.replace(/[^a-zA-Z0-9_]/g, '_');
      output += `o ${cleanName}\n`;

      for (let i = 0; i < posAttr.count; i++) {
        output += `v ${posAttr.getX(i).toFixed(4)} ${posAttr.getY(i).toFixed(4)} ${posAttr.getZ(i).toFixed(4)}\n`;
      }

      if (geo.index) {
        const indexAttr = geo.index;
        for (let i = 0; i < indexAttr.count; i += 3) {
          output += `f ${indexAttr.getX(i) + vertexOffset} ${indexAttr.getY(i) + vertexOffset} ${indexAttr.getZ(i) + vertexOffset}\n`;
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) {
          output += `f ${i + vertexOffset} ${i + 1 + vertexOffset} ${i + 2 + vertexOffset}\n`;
        }
      }
      vertexOffset += posAttr.count;
    }
  });

  const blob = new Blob([output], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `biopunk_nurbs_ship_seed_${seed}.obj`;
  link.click();
  URL.revokeObjectURL(url);
}

