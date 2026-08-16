export const TOD_TRANSLATION_SCALE = 1 / 5;
export const PEPSIMAN_ROOT_BASIS_X = degreesToRadians(-103);

function degreesToRadians(value) {
  return value * Math.PI / 180;
}

export function applySetupTransform(node, frame = {}) {
  const translation = frame.translation || [0, 0, 0];
  const rotation = frame.rotation || [0, 0, 0];
  const scale = frame.scale || [1, 1, 1];
  node.position.set(
    translation[0] * TOD_TRANSLATION_SCALE,
    -translation[1] * TOD_TRANSLATION_SCALE,
    -translation[2] * TOD_TRANSLATION_SCALE,
  );
  node.rotation.set(rotation[0], -rotation[1], -rotation[2], "XYZ");
  node.scale.set(...scale);
}

export function applyExtractedRootMotion(THREE, rootNode, rootBind, pelvisBase, sample) {
  const sourcePosition = sample.translation
    ? new THREE.Vector3(
        sample.translation[0] * TOD_TRANSLATION_SCALE,
        -sample.translation[1] * TOD_TRANSLATION_SCALE,
        -sample.translation[2] * TOD_TRANSLATION_SCALE,
      )
    : pelvisBase.position.clone();
  const sourceRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(sample.rotation[0] - PEPSIMAN_ROOT_BASIS_X, -sample.rotation[1], -sample.rotation[2], "XYZ"),
  );
  const pelvisBaseRotation = new THREE.Quaternion().setFromEuler(pelvisBase.rotation);
  const rootBindRotation = new THREE.Quaternion().setFromEuler(rootBind.rotation);
  const unitScale = new THREE.Vector3(1, 1, 1);
  const sourcePelvis = new THREE.Matrix4().compose(sourcePosition, sourceRotation, unitScale);
  const inverseBasePelvis = new THREE.Matrix4()
    .compose(pelvisBase.position, pelvisBaseRotation, unitScale)
    .invert();
  const rootDelta = sourcePelvis.multiply(inverseBasePelvis);
  const rootMatrix = new THREE.Matrix4()
    .compose(rootBind.position, rootBindRotation, unitScale)
    .multiply(rootDelta);
  rootMatrix.decompose(rootNode.position, rootNode.quaternion, rootNode.scale);
}
