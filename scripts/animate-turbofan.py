"""Add a looping front-fan animation to the bundled Sketchfab GLB.

The export merges blades and casing by material. Split only the connected
front blade surfaces into a rotor, preserving their original vertex data.
Run with: python3 scripts/animate-turbofan.py
"""
import json
import math
import struct
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src/lib/scene/turbine__turbofan_engine__jet_engine.glb'
source = path.read_bytes()
json_length = struct.unpack_from('<I', source, 12)[0]
model = json.loads(source[20:20 + json_length])
if any(clip.get('name') == 'Fan spin' for clip in model.get('animations', [])):
    print('Fan spin is already embedded.')
    raise SystemExit(0)
binary = bytearray(source[28 + json_length:])


def read_accessor(index):
    accessor = model['accessors'][index]
    view = model['bufferViews'][accessor['bufferView']]
    component = {5126: 'f', 5125: 'I', 5123: 'H'}[accessor['componentType']]
    width = {'VEC3': 3, 'SCALAR': 1}[accessor['type']]
    size = struct.calcsize(component) * width
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return [struct.unpack_from('<' + component * width, binary,
                              offset + i * view.get('byteStride', size))
            for i in range(accessor['count'])]


def append_accessor(values, kind, component, width, bounds=None):
    binary.extend(b'\0' * (-len(binary) % 4))
    offset = len(binary)
    fmt = {5126: 'f', 5125: 'I'}[component]
    binary.extend(struct.pack('<' + fmt * len(values), *values))
    view = len(model['bufferViews'])
    model['bufferViews'].append({'buffer': 0, 'byteOffset': offset,
                                'byteLength': len(binary) - offset})
    accessor = {'bufferView': view, 'componentType': component,
                'count': len(values) // width, 'type': kind}
    if bounds:
        accessor.update(bounds)
    model['accessors'].append(accessor)
    return len(model['accessors']) - 1


rotor_primitives = []
for mesh_index in (3, 13):
    primitive = model['meshes'][mesh_index]['primitives'][0]
    positions = read_accessor(primitive['attributes']['POSITION'])
    indices = [value[0] for value in read_accessor(primitive['indices'])]
    parents = list(range(len(positions)))

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    # Weld UV/normal seams for component detection, without changing geometry.
    seen = {}
    for index, position in enumerate(positions):
        key = tuple(round(value, 5) for value in position)
        if key in seen:
            parents[root(index)] = root(seen[key])
        else:
            seen[key] = index
    for i in range(0, len(indices), 3):
        a, b, c = indices[i:i + 3]
        parents[root(b)] = root(a)
        parents[root(c)] = root(a)
    components = {}
    for index in indices:
        components.setdefault(root(index), set()).add(index)
    blades = set()
    blade_count = 0
    for vertices in components.values():
        points = [positions[index] for index in vertices]
        if (min(point[0] for point in points) > 1.77
                and max(math.hypot(point[1], point[2]) for point in points) > 0.5
                and max(point[0] for point in points) < 1.92):
            blades.update(vertices)
            blade_count += 1
    assert blade_count == 16, f'Unexpected blade geometry in mesh {mesh_index}'
    stationary, moving = [], []
    for i in range(0, len(indices), 3):
        triangle = indices[i:i + 3]
        (moving if triangle[0] in blades else stationary).extend(triangle)
    primitive['indices'] = append_accessor(stationary, 'SCALAR', 5125, 1)
    rotor_primitives.append({**primitive,
                             'indices': append_accessor(moving, 'SCALAR', 5125, 1)})

rotor_mesh = len(model['meshes'])
model['meshes'].append({'name': 'Front fan blades', 'primitives': rotor_primitives})
rotor_node = len(model['nodes'])
# The original geometry is centered on the local X shaft, so no pivot offset is needed.
model['nodes'].append({'name': 'Front fan rotor', 'mesh': rotor_mesh})
model['nodes'][1]['children'].append(rotor_node)
times = append_accessor([0, 0.75, 1.5, 2.25, 3], 'SCALAR', 5126, 1,
                        {'min': [0], 'max': [3]})
rotations = []
for step in range(5):
    half_angle = step * math.pi / 4
    rotations.extend([math.sin(half_angle), 0, 0, math.cos(half_angle)])
rotation = append_accessor(rotations, 'VEC4', 5126, 4)
model['animations'] = [{'name': 'Fan spin',
                        'samplers': [{'input': times, 'output': rotation, 'interpolation': 'LINEAR'}],
                        'channels': [{'sampler': 0,
                                      'target': {'node': rotor_node, 'path': 'rotation'}}]}]
model['buffers'][0]['byteLength'] = len(binary)
encoded = json.dumps(model, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
length = 12 + 8 + len(encoded) + 8 + len(binary)
path.write_bytes(struct.pack('<III', 0x46546C67, 2, length)
                 + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
                 + struct.pack('<II', len(binary), 0x004E4942) + binary)
print('Embedded Fan spin: 16 blades, two material surfaces, three-second loop.')
