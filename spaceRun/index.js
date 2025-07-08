// 纹理资源
const TEXTURES = {
    earth: './earth.jpg',
    starBg: './star_bg.jpg'
};

// 主程序入口
window.onload = function() {
    const canvas = document.getElementById('webgl-canvas');
    const gl = canvas.getContext('webgl');
    const loadingScreen = document.getElementById('loading-screen');
    const speedDisplay = document.getElementById('speed-display');
    const periodValue = document.getElementById('period-value');
    const stationPosition = document.getElementById('station-position');
    
    if (!gl) {
        alert('您的浏览器不支持WebGL！');
        return;
    }
    
    // 设置Canvas尺寸
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // 顶点着色器源码
    const vsSource = `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        attribute vec2 aTexCoord;
        
        uniform mat4 uModelMatrix;
        uniform mat4 uViewMatrix;
        uniform mat4 uProjectionMatrix;
        uniform mat3 uNormalMatrix;
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vTexCoord;
        
        void main() {
            vec4 worldPosition = uModelMatrix * vec4(aPosition, 1.0);
            vPosition = worldPosition.xyz;
            vNormal = uNormalMatrix * aNormal;
            vTexCoord = aTexCoord;
            gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;
        }
    `;
    
    // 片段着色器源码
    const fsSource = `
        precision mediump float;
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vTexCoord;
        
        uniform vec3 uLightPosition;
        uniform vec3 uLightColor;
        uniform vec3 uAmbientColor;
        uniform sampler2D uTexture;
        uniform vec3 uColor;
        uniform bool uUseTexture;
        uniform bool uIsCore;
        uniform bool uIsOrbit;
        
        void main() {
            if (uIsOrbit) {
                gl_FragColor = vec4(0.3, 0.6, 1.0, 0.6);
                return;
            }
            
            vec3 normal = normalize(vNormal);
            vec3 lightDirection = normalize(uLightPosition - vPosition);
            
            // 漫反射
            float diffuse = max(dot(normal, lightDirection), 0.0);
            vec3 diffuseColor = diffuse * uLightColor;
            
            // 环境光
            vec3 ambientColor = uAmbientColor;
            
            // 最终颜色
            vec4 baseColor = uUseTexture ? texture2D(uTexture, vTexCoord) : vec4(uColor, 1.0);
            vec3 finalColor = (ambientColor + diffuseColor) * baseColor.rgb;
            
            // 如果是核心舱，增加高光效果
            if (uIsCore) {
                vec3 viewDirection = normalize(-vPosition);
                vec3 reflectDirection = reflect(-lightDirection, normal);
                float specular = pow(max(dot(viewDirection, reflectDirection), 0.0), 32.0);
                finalColor += specular * vec3(0.8, 0.8, 0.8);
            }
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;
    
    // 编译着色器
    function compileShader(gl, source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('着色器编译错误：', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    // 创建着色器程序
    const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('着色器程序链接错误：', gl.getProgramInfoLog(shaderProgram));
    }
    
    gl.useProgram(shaderProgram);
    
    // 获取属性位置
    const attribLocations = {
        position: gl.getAttribLocation(shaderProgram, 'aPosition'),
        normal: gl.getAttribLocation(shaderProgram, 'aNormal'),
        texCoord: gl.getAttribLocation(shaderProgram, 'aTexCoord')
    };
    
    // 获取uniform位置
    const uniformLocations = {
        modelMatrix: gl.getUniformLocation(shaderProgram, 'uModelMatrix'),
        viewMatrix: gl.getUniformLocation(shaderProgram, 'uViewMatrix'),
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
        normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
        lightPosition: gl.getUniformLocation(shaderProgram, 'uLightPosition'),
        lightColor: gl.getUniformLocation(shaderProgram, 'uLightColor'),
        ambientColor: gl.getUniformLocation(shaderProgram, 'uAmbientColor'),
        texture: gl.getUniformLocation(shaderProgram, 'uTexture'),
        color: gl.getUniformLocation(shaderProgram, 'uColor'),
        useTexture: gl.getUniformLocation(shaderProgram, 'uUseTexture'),
        isCore: gl.getUniformLocation(shaderProgram, 'uIsCore'),
        isOrbit: gl.getUniformLocation(shaderProgram, 'uIsOrbit')
    };
    
    // 矩阵操作函数
    function createMatrix() {
        return new Float32Array(16);
    }
    
    function identityMatrix(matrix) {
        matrix[0] = 1; matrix[4] = 0; matrix[8] = 0; matrix[12] = 0;
        matrix[1] = 0; matrix[5] = 1; matrix[9] = 0; matrix[13] = 0;
        matrix[2] = 0; matrix[6] = 0; matrix[10] = 1; matrix[14] = 0;
        matrix[3] = 0; matrix[7] = 0; matrix[11] = 0; matrix[15] = 1;
    }
    
    function perspectiveMatrix(matrix, fov, aspect, near, far) {
        const f = 1.0 / Math.tan(fov * 0.5);
        const rangeInv = 1.0 / (near - far);
        
        matrix[0] = f / aspect; matrix[4] = 0; matrix[8] = 0; matrix[12] = 0;
        matrix[1] = 0; matrix[5] = f; matrix[9] = 0; matrix[13] = 0;
        matrix[2] = 0; matrix[6] = 0; matrix[10] = (near + far) * rangeInv; matrix[14] = near * far * rangeInv * 2;
        matrix[3] = 0; matrix[7] = 0; matrix[11] = -1; matrix[15] = 0;
    }
    
    function translateMatrix(matrix, x, y, z) {
        matrix[12] += x;
        matrix[13] += y;
        matrix[14] += z;
    }
    
    function rotateXMatrix(matrix, angle) {
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        
        const m4 = matrix[4], m5 = matrix[5], m6 = matrix[6], m7 = matrix[7];
        const m8 = matrix[8], m9 = matrix[9], m10 = matrix[10], m11 = matrix[11];
        
        matrix[4] = m4 * c + m8 * s;
        matrix[5] = m5 * c + m9 * s;
        matrix[6] = m6 * c + m10 * s;
        matrix[7] = m7 * c + m11 * s;
        
        matrix[8] = m8 * c - m4 * s;
        matrix[9] = m9 * c - m5 * s;
        matrix[10] = m10 * c - m6 * s;
        matrix[11] = m11 * c - m7 * s;
    }
    
    function rotateYMatrix(matrix, angle) {
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        
        const m0 = matrix[0], m1 = matrix[1], m2 = matrix[2], m3 = matrix[3];
        const m8 = matrix[8], m9 = matrix[9], m10 = matrix[10], m11 = matrix[11];
        
        matrix[0] = m0 * c - m8 * s;
        matrix[1] = m1 * c - m9 * s;
        matrix[2] = m2 * c - m10 * s;
        matrix[3] = m3 * c - m11 * s;
        
        matrix[8] = m0 * s + m8 * c;
        matrix[9] = m1 * s + m9 * c;
        matrix[10] = m2 * s + m10 * c;
        matrix[11] = m3 * s + m11 * c;
    }
    
    function rotateZMatrix(matrix, angle) {
        const s = Math.sin(angle);
        const c = Math.cos(angle);
        
        const m0 = matrix[0], m1 = matrix[1], m2 = matrix[2], m3 = matrix[3];
        const m4 = matrix[4], m5 = matrix[5], m6 = matrix[6], m7 = matrix[7];
        
        matrix[0] = m0 * c + m4 * s;
        matrix[1] = m1 * c + m5 * s;
        matrix[2] = m2 * c + m6 * s;
        matrix[3] = m3 * c + m7 * s;
        
        matrix[4] = m4 * c - m0 * s;
        matrix[5] = m5 * c - m1 * s;
        matrix[6] = m6 * c - m2 * s;
        matrix[7] = m7 * c - m3 * s;
    }
    
    function scaleMatrix(matrix, x, y, z) {
        matrix[0] *= x;
        matrix[1] *= x;
        matrix[2] *= x;
        matrix[3] *= x;
        
        matrix[4] *= y;
        matrix[5] *= y;
        matrix[6] *= y;
        matrix[7] *= y;
        
        matrix[8] *= z;
        matrix[9] *= z;
        matrix[10] *= z;
        matrix[11] *= z;
    }
    
    function multiplyMatrix(out, a, b) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        
        let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
        out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
        
        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
        
        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
        
        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
        out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
        out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
        out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    }
    
    function normalMatrix(out, mat) {
        const a00 = mat[0], a01 = mat[1], a02 = mat[2];
        const a10 = mat[4], a11 = mat[5], a12 = mat[6];
        const a20 = mat[8], a21 = mat[9], a22 = mat[10];
        
        const b01 = a22 * a11 - a12 * a21;
        const b11 = -a22 * a10 + a12 * a20;
        const b21 = a21 * a10 - a11 * a20;
        
        let det = a00 * b01 + a01 * b11 + a02 * b21;
        if (!det) return null;
        det = 1.0 / det;
        
        out[0] = b01 * det;
        out[1] = (-a22 * a01 + a02 * a21) * det;
        out[2] = (a12 * a01 - a02 * a11) * det;
        
        out[3] = b11 * det;
        out[4] = (a22 * a00 - a02 * a20) * det;
        out[5] = (-a12 * a00 + a02 * a10) * det;
        
        out[6] = b21 * det;
        out[7] = (-a21 * a00 + a01 * a20) * det;
        out[8] = (a11 * a00 - a01 * a10) * det;
    }
    
    // 创建纹理
    function createTexture(gl, url) {
        return new Promise((resolve, reject) => {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            
            // 临时使用单像素纹理
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, 
                          new Uint8Array([0, 0, 255, 255]));
            
            const image = new Image();
            image.crossOrigin = "Anonymous";
            image.onload = function() {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                
                // 生成mipmap
                gl.generateMipmap(gl.TEXTURE_2D);
                
                // 设置纹理参数
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                
                resolve(texture);
            };
            image.onerror = reject;
            image.src = url;
        });
    }
    
    // 创建星空背景
    function createStars(gl, count) {
        const positions = new Float32Array(count * 3);
        
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const radius = 200 + Math.random() * 800;
            
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = radius * Math.cos(phi);
        }
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        return {
            buffer: positionBuffer,
            count: count
        };
    }
    
    // 创建球体模型
    function createSphere(gl, radius, widthSegments, heightSegments) {
        const positions = [];
        const normals = [];
        const texCoords = [];
        const indices = [];
        
        for (let y = 0; y <= heightSegments; y++) {
            const theta = y * Math.PI / heightSegments;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            
            for (let x = 0; x <= widthSegments; x++) {
                const phi = x * 2 * Math.PI / widthSegments;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);
                
                const px = radius * sinTheta * cosPhi;
                const py = radius * cosTheta;
                const pz = radius * sinTheta * sinPhi;
                
                positions.push(px, py, pz);
                normals.push(px / radius, py / radius, pz / radius);
                texCoords.push(1 - x / widthSegments, 1 - y / heightSegments);
            }
        }
        
        for (let y = 0; y < heightSegments; y++) {
            for (let x = 0; x < widthSegments; x++) {
                const a = y * (widthSegments + 1) + x;
                const b = a + widthSegments + 1;
                const c = a + 1;
                const d = b + 1;
                
                indices.push(a, b, c);
                indices.push(c, b, d);
            }
        }
        
        return {
            positionBuffer: createBuffer(gl, new Float32Array(positions)),
            normalBuffer: createBuffer(gl, new Float32Array(normals)),
            texCoordBuffer: createBuffer(gl, new Float32Array(texCoords)),
            indexBuffer: createIndexBuffer(gl, new Uint16Array(indices)),
            indicesCount: indices.length
        };
    }
    
    // 创建圆柱体模型
    function createCylinder(gl, radiusTop, radiusBottom, height, radialSegments) {
        const positions = [];
        const normals = [];
        const indices = [];
        
        // 顶部
        positions.push(0, height / 2, 0);
        normals.push(0, 1, 0);
        
        for (let i = 0; i <= radialSegments; i++) {
            const theta = i * Math.PI * 2 / radialSegments;
            const x = radiusTop * Math.cos(theta);
            const z = radiusTop * Math.sin(theta);
            
            positions.push(x, height / 2, z);
            normals.push(0, 1, 0);
        }
        
        // 侧面
        for (let i = 0; i <= radialSegments; i++) {
            const theta = i * Math.PI * 2 / radialSegments;
            const xTop = radiusTop * Math.cos(theta);
            const zTop = radiusTop * Math.sin(theta);
            const xBottom = radiusBottom * Math.cos(theta);
            const zBottom = radiusBottom * Math.sin(theta);
            
            positions.push(xTop, height / 2, zTop);
            positions.push(xBottom, -height / 2, zBottom);
            
            const normal = [Math.cos(theta), 0, Math.sin(theta)];
            normals.push(...normal, ...normal);
        }
        
        // 底部
        positions.push(0, -height / 2, 0);
        normals.push(0, -1, 0);
        
        for (let i = 0; i <= radialSegments; i++) {
            const theta = i * Math.PI * 2 / radialSegments;
            const x = radiusBottom * Math.cos(theta);
            const z = radiusBottom * Math.sin(theta);
            
            positions.push(x, -height / 2, z);
            normals.push(0, -1, 0);
        }
        
        // 顶部索引
        for (let i = 1; i <= radialSegments; i++) {
            indices.push(0, i, i + 1);
        }
        
        // 侧面索引
        const topCenterIndex = 0;
        const bottomCenterIndex = positions.length / 3 - 1;
        const sideOffset = radialSegments + 2;
        
        for (let i = 0; i < radialSegments; i++) {
            const topIndex = i * 2 + sideOffset;
            const topNextIndex = (i + 1) * 2 + sideOffset;
            const bottomIndex = i * 2 + 1 + sideOffset;
            const bottomNextIndex = (i + 1) * 2 + 1 + sideOffset;
            
            indices.push(topIndex, bottomIndex, topNextIndex);
            indices.push(topNextIndex, bottomIndex, bottomNextIndex);
        }
        
        // 底部索引
        const bottomStart = bottomCenterIndex - radialSegments - 1;
        for (let i = 0; i < radialSegments; i++) {
            indices.push(bottomCenterIndex, bottomStart + i + 1, bottomStart + i);
        }
        
        return {
            positionBuffer: createBuffer(gl, new Float32Array(positions)),
            normalBuffer: createBuffer(gl, new Float32Array(normals)),
            indexBuffer: createIndexBuffer(gl, new Uint16Array(indices)),
            indicesCount: indices.length
        };
    }
    
    // 创建立方体模型
    function createCube(gl, width, height, depth) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const halfDepth = depth / 2;
        
        const positions = [
            // 前
            -halfWidth, -halfHeight, halfDepth,
            halfWidth, -halfHeight, halfDepth,
            halfWidth, halfHeight, halfDepth,
            -halfWidth, halfHeight, halfDepth,
            
            // 后
            -halfWidth, -halfHeight, -halfDepth,
            -halfWidth, halfHeight, -halfDepth,
            halfWidth, halfHeight, -halfDepth,
            halfWidth, -halfHeight, -halfDepth,
            
            // 上
            -halfWidth, halfHeight, -halfDepth,
            -halfWidth, halfHeight, halfDepth,
            halfWidth, halfHeight, halfDepth,
            halfWidth, halfHeight, -halfDepth,
            
            // 下
            -halfWidth, -halfHeight, -halfDepth,
            halfWidth, -halfHeight, -halfDepth,
            halfWidth, -halfHeight, halfDepth,
            -halfWidth, -halfHeight, halfDepth,
            
            // 右
            halfWidth, -halfHeight, -halfDepth,
            halfWidth, halfHeight, -halfDepth,
            halfWidth, halfHeight, halfDepth,
            halfWidth, -halfHeight, halfDepth,
            
            // 左
            -halfWidth, -halfHeight, -halfDepth,
            -halfWidth, -halfHeight, halfDepth,
            -halfWidth, halfHeight, halfDepth,
            -halfWidth, halfHeight, -halfDepth
        ];
        
        const normals = [
            // 前
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
            
            // 后
            0, 0, -1,
            0, 0, -1,
            0, 0, -1,
            0, 0, -1,
            
            // 上
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
            
            // 下
            0, -1, 0,
            0, -1, 0,
            0, -1, 0,
            0, -1, 0,
            
            // 右
            1, 0, 0,
            1, 0, 0,
            1, 0, 0,
            1, 0, 0,
            
            // 左
            -1, 0, 0,
            -1, 0, 0,
            -1, 0, 0,
            -1, 0, 0
        ];
        
        const indices = [
            0, 1, 2, 0, 2, 3,       // 前
            4, 5, 6, 4, 6, 7,       // 后
            8, 9, 10, 8, 10, 11,    // 上
            12, 13, 14, 12, 14, 15,  // 下
            16, 17, 18, 16, 18, 19,  // 右
            20, 21, 22, 20, 22, 23   // 左
        ];
        
        return {
            positionBuffer: createBuffer(gl, new Float32Array(positions)),
            normalBuffer: createBuffer(gl, new Float32Array(normals)),
            indexBuffer: createIndexBuffer(gl, new Uint16Array(indices)),
            indicesCount: indices.length
        };
    }
    
    function createBuffer(gl, data) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return buffer;
    }
    
    function createIndexBuffer(gl, data) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return buffer;
    }
    
    // 加载纹理
    async function loadTextures() {
        try {
            const earthTexture = await createTexture(gl, TEXTURES.earth);
            const starBgTexture = await createTexture(gl, TEXTURES.starBg);
            return { earthTexture, starBgTexture };
        } catch (error) {
            console.error('纹理加载失败:', error);
            loadingScreen.querySelector('.texture-loading').textContent = '纹理加载失败，使用默认纹理';
            
            // 创建默认纹理作为后备
            const earthTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, earthTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, 
                          new Uint8Array([0, 0, 255, 255]));
            
            const starBgTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, starBgTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, 
                          new Uint8Array([0, 0, 0, 255]));
            
            return { earthTexture, starBgTexture };
        }
    }
    
    // 创建天空球
    function createSkySphere(gl) {
        const skySphere = createSphere(gl, 100, 32, 32);
        
        // 修改纹理坐标使其适合星空贴图
        const texCoords = new Float32Array(skySphere.texCoordBuffer.data);
        for (let i = 0; i < texCoords.length; i += 2) {
            texCoords[i] *= 2.0; // 水平重复两次以覆盖整个天空
        }
        
        gl.bindBuffer(gl.ARRAY_BUFFER, skySphere.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
        
        return skySphere;
    }
    
    // 创建轨道轨迹
    function createOrbitTrail(gl, radius, segments) {
        const positions = [];
        
        for (let i = 0; i <= segments; i++) {
            const theta = i * 2 * Math.PI / segments;
            positions.push(
                radius * Math.cos(theta),
                0,
                radius * Math.sin(theta)
            );
        }
        
        return {
            buffer: createBuffer(gl, new Float32Array(positions)),
            count: positions.length / 3
        };
    }
    
    // 计算空间站位置（在Z轴平面上）
    function calculateStationPosition(rotation, radius, tilt) {
        // 在XZ平面计算位置
        const x = radius * Math.cos(rotation);
        const y = 0;
        const z = radius * Math.sin(rotation);
        
        // 然后绕X轴旋转轨道倾角
        const newY = y * Math.cos(tilt) - z * Math.sin(tilt);
        const newZ = y * Math.sin(tilt) + z * Math.cos(tilt);
        
        return {x, y: newY, z: newZ};
    }
    
    // 主初始化函数
    async function init() {
        // 加载纹理
        const { earthTexture, starBgTexture } = await loadTextures();
        
        // 创建模型
        const earth = createSphere(gl, 1.0, 32, 32);
        earth.texture = earthTexture;
        
        const skySphere = createSkySphere(gl);
        skySphere.texture = starBgTexture;
        
        // 创建空间站组件
        const core = createCylinder(gl, 0.12, 0.12, 1.5, 16);
        const labModule = createCylinder(gl, 0.1, 0.1, 0.8, 16);
        const solarPanel = createCube(gl, 1.2, 0.02, 0.4);
        
        // 创建轨道轨迹
        const orbitTrail = createOrbitTrail(gl, 4, 100);
        const stars = createStars(gl, 2000);
        
        // 设置相机
        const viewMatrix = createMatrix();
        identityMatrix(viewMatrix);
        translateMatrix(viewMatrix, 0, 0, -8);
        
        const projectionMatrix = createMatrix();
        
        // 设置光照
        const lightPosition = [10, 10, 10];
        const lightColor = [1.0, 1.0, 1.0];
        const ambientColor = [0.2, 0.2, 0.2];
        
        // 动画变量
        let earthRotation = 0;
        let stationRotation = 0;
        let lastTime = 0;
        let orbitSpeed = 1.0;
        
        // 交互变量
        let isDragging = false;
        let lastX = 0, lastY = 0;
        let rotateX = 0, rotateY = 0;
        let zoom = -10;
        let showTrail = true;
        
        // 轨道倾角 (42度)
        const orbitTilt = Math.PI * 42 / 180;
        
        // 键盘事件
        window.addEventListener('keydown', function(e) {
            if (e.key === 't' || e.key === 'T') {
                showTrail = !showTrail;
            }
            if (e.key === '+' || e.key === '=') {
                orbitSpeed = Math.min(orbitSpeed + 0.1, 20);
                speedDisplay.textContent = orbitSpeed.toFixed(1) + 'x';
                periodValue.textContent = Math.round(90 / orbitSpeed);
            }
            if (e.key === '-' || e.key === '_') {
                orbitSpeed = Math.max(orbitSpeed - 0.1, 0.1);
                speedDisplay.textContent = orbitSpeed.toFixed(1) + 'x';
                periodValue.textContent = Math.round(90 / orbitSpeed);
            }
        });
        
        // 鼠标事件
        canvas.addEventListener('mousedown', function(e) {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        
        canvas.addEventListener('mousemove', function(e) {
            if (isDragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                
                rotateY += dx * 0.01;
                rotateX += dy * 0.01;
                
                lastX = e.clientX;
                lastY = e.clientY;
            }
        });
        
        canvas.addEventListener('mouseup', function() {
            isDragging = false;
        });
        
        canvas.addEventListener('mouseleave', function() {
            isDragging = false;
        });
        
        canvas.addEventListener('wheel', function(e) {
            zoom += e.deltaY * 0.01;
            if (zoom > -2) zoom = -2;
            if (zoom < -15) zoom = -15;
            e.preventDefault();
        });
        
        // 渲染函数
        function render(time) {
            time *= 0.001; // 转换为秒
            const deltaTime = time - lastTime;
            lastTime = time;
            
            // 更新旋转
            earthRotation += deltaTime * 0.2;
            stationRotation += deltaTime * orbitSpeed * 0.05;
            
            // 计算空间站位置（在Z轴平面上）
            const stationPos = calculateStationPosition(stationRotation, 4, orbitTilt);
            stationPosition.textContent = `(${stationPos.x.toFixed(2)}, ${stationPos.y.toFixed(2)}, ${stationPos.z.toFixed(2)})`;
            
            // 清除画布
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            
            // 更新投影矩阵
            perspectiveMatrix(projectionMatrix, Math.PI/4, canvas.width/canvas.height, 0.1, 1000);
            gl.uniformMatrix4fv(uniformLocations.projectionMatrix, false, projectionMatrix);
            
            // 更新视图矩阵
            identityMatrix(viewMatrix);
            translateMatrix(viewMatrix, 0, 0, zoom);
            rotateXMatrix(viewMatrix, rotateX);
            rotateYMatrix(viewMatrix, rotateY);
            gl.uniformMatrix4fv(uniformLocations.viewMatrix, false, viewMatrix);
            
            // 设置光照
            gl.uniform3fv(uniformLocations.lightPosition, lightPosition);
            gl.uniform3fv(uniformLocations.lightColor, lightColor);
            gl.uniform3fv(uniformLocations.ambientColor, ambientColor);
            
            // 渲染星空背景
            gl.disable(gl.DEPTH_TEST);
            gl.bindBuffer(gl.ARRAY_BUFFER, stars.buffer);
            gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.position);
            
            // 使用简单的着色
            gl.vertexAttrib3f(attribLocations.normal, 0, 0, 0);
            gl.disableVertexAttribArray(attribLocations.normal);
            
            gl.uniform1i(uniformLocations.useTexture, false);
            gl.uniform3f(uniformLocations.color, 1.0, 1.0, 1.0);
            
            const starModelMatrix = createMatrix();
            identityMatrix(starModelMatrix);
            gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, starModelMatrix);
            
            const starNormalMatrix = new Float32Array(9);
            identityMatrix(starNormalMatrix);
            gl.uniformMatrix3fv(uniformLocations.normalMatrix, false, starNormalMatrix);
            
            gl.drawArrays(gl.POINTS, 0, stars.count);
            gl.enable(gl.DEPTH_TEST);
            
            // 渲染天空球
            const skyModelMatrix = createMatrix();
            identityMatrix(skyModelMatrix);
            gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, skyModelMatrix);
            
            const skyNormalMatrix = new Float32Array(9);
            identityMatrix(skyNormalMatrix);
            gl.uniformMatrix3fv(uniformLocations.normalMatrix, false, skyNormalMatrix);
            
            // 绑定天空球缓冲区
            gl.bindBuffer(gl.ARRAY_BUFFER, skySphere.positionBuffer);
            gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.position);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, skySphere.normalBuffer);
            gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.normal);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, skySphere.texCoordBuffer);
            gl.vertexAttribPointer(attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.texCoord);
            
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skySphere.indexBuffer);
            
            // 使用星空纹理
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, skySphere.texture);
            gl.uniform1i(uniformLocations.texture, 0);
            gl.uniform1i(uniformLocations.useTexture, true);
            
            gl.drawElements(gl.TRIANGLES, skySphere.indicesCount, gl.UNSIGNED_SHORT, 0);
            
            // 渲染地球
            const earthModelMatrix = createMatrix();
            identityMatrix(earthModelMatrix);
            rotateYMatrix(earthModelMatrix, earthRotation);
            gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, earthModelMatrix);
            
            const earthNormalMatrix = new Float32Array(9);
            normalMatrix(earthNormalMatrix, earthModelMatrix);
            gl.uniformMatrix3fv(uniformLocations.normalMatrix, false, earthNormalMatrix);
            
            // 绑定地球缓冲区
            gl.bindBuffer(gl.ARRAY_BUFFER, earth.positionBuffer);
            gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.position);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, earth.normalBuffer);
            gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.normal);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, earth.texCoordBuffer);
            gl.vertexAttribPointer(attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.texCoord);
            
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, earth.indexBuffer);
            
            // 使用地球纹理
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, earth.texture);
            gl.uniform1i(uniformLocations.texture, 0);
            gl.uniform1i(uniformLocations.useTexture, true);
            
            gl.drawElements(gl.TRIANGLES, earth.indicesCount, gl.UNSIGNED_SHORT, 0);
            
            // 渲染轨道轨迹
            if (showTrail) {
                gl.uniform1i(uniformLocations.useTexture, false);
                gl.uniform1i(uniformLocations.isOrbit, true);
                
                const trailModelMatrix = createMatrix();
                identityMatrix(trailModelMatrix);
                rotateXMatrix(trailModelMatrix, orbitTilt);
                gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, trailModelMatrix);
                
                gl.bindBuffer(gl.ARRAY_BUFFER, orbitTrail.buffer);
                gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(attribLocations.position);
                
                gl.disableVertexAttribArray(attribLocations.normal);
                gl.disableVertexAttribArray(attribLocations.texCoord);
                
                // 使用线条绘制轨迹
                gl.drawArrays(gl.LINE_STRIP, 0, orbitTrail.count);
                
                gl.uniform1i(uniformLocations.isOrbit, false);
            }
            
            // 渲染空间站 - 关键修复：在Z轴平面上公转
            const stationModelMatrix = createMatrix();
            identityMatrix(stationModelMatrix);
            
            // 1. 平移到轨道位置
            translateMatrix(stationModelMatrix, stationPos.x, stationPos.y, stationPos.z);
            
            // 2. 空间站朝向地球中心
            const toEarth = [0 - stationPos.x, 0 - stationPos.y, 0 - stationPos.z];
            const length = Math.sqrt(toEarth[0]*toEarth[0] + toEarth[1]*toEarth[1] + toEarth[2]*toEarth[2]);
            toEarth[0] /= length; toEarth[1] /= length; toEarth[2] /= length;
            
            // 计算绕Y轴旋转角度
            const yAngle = Math.atan2(toEarth[0], toEarth[2]);
            rotateYMatrix(stationModelMatrix, -yAngle);
            
            // 计算绕X轴旋转角度
            const xAngle = Math.atan2(toEarth[1], Math.sqrt(toEarth[0]*toEarth[0] + toEarth[2]*toEarth[2]));
            rotateXMatrix(stationModelMatrix, -xAngle);
            
            // 计算空间站法线矩阵
            const stationNormalMatrix = new Float32Array(9);
            normalMatrix(stationNormalMatrix, stationModelMatrix);
            gl.uniformMatrix3fv(uniformLocations.normalMatrix, false, stationNormalMatrix);
            
            // 渲染核心舱 (长圆柱体) - 白色
            gl.uniform1i(uniformLocations.useTexture, false);
            gl.uniform3f(uniformLocations.color, 1.0, 1.0, 1.0);
            gl.uniform1i(uniformLocations.isCore, true);
            
            const coreModelMatrix = createMatrix();
            identityMatrix(coreModelMatrix);
            rotateZMatrix(coreModelMatrix, 0);
            multiplyMatrix(coreModelMatrix, stationModelMatrix, coreModelMatrix);
            gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, coreModelMatrix);
            
            // 绑定核心舱缓冲区
            gl.bindBuffer(gl.ARRAY_BUFFER, core.positionBuffer);
            gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.position);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, core.normalBuffer);
            gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribLocations.normal);
            
            gl.disableVertexAttribArray(attribLocations.texCoord);
            
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, core.indexBuffer);
            gl.drawElements(gl.TRIANGLES, core.indicesCount, gl.UNSIGNED_SHORT, 0);
            
            // 渲染实验舱 (短圆柱体) - 浅灰色
            gl.uniform3f(uniformLocations.color, 0.8, 0.8, 0.8);
            gl.uniform1i(uniformLocations.isCore, false);
            
            const labModelMatrix = createMatrix();
            identityMatrix(labModelMatrix);
            translateMatrix(labModelMatrix, 0, 0.8, 0);
            rotateZMatrix(labModelMatrix, 0);
            multiplyMatrix(labModelMatrix, stationModelMatrix, labModelMatrix);
            gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, labModelMatrix);
            
            // 绑定实验舱缓冲区
            gl.bindBuffer(gl.ARRAY_BUFFER, labModule.positionBuffer);
            gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, labModule.normalBuffer);
            gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
            
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, labModule.indexBuffer);
            gl.drawElements(gl.TRIANGLES, labModule.indicesCount, gl.UNSIGNED_SHORT, 0);
            
            // 渲染太阳能板 (长方体) - 浅蓝色
            gl.uniform3f(uniformLocations.color, 0.3, 0.6, 1.0);
            
            // 左侧太阳能板
            const leftPanelModelMatrix = createMatrix();
            identityMatrix(leftPanelModelMatrix);
            translateMatrix(leftPanelModelMatrix, -0.2, -0.2, 0); 
            rotateZMatrix(leftPanelModelMatrix, 0);
            multiplyMatrix(leftPanelModelMatrix, stationModelMatrix, leftPanelModelMatrix);
            gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, leftPanelModelMatrix);
            
            // 绑定太阳能板缓冲区
            gl.bindBuffer(gl.ARRAY_BUFFER, solarPanel.positionBuffer);
            gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, solarPanel.normalBuffer);
            gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
            
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, solarPanel.indexBuffer);
            gl.drawElements(gl.TRIANGLES, solarPanel.indicesCount, gl.UNSIGNED_SHORT, 0);
            
            // 右侧太阳能板
            const rightPanelModelMatrix = createMatrix();
            identityMatrix(rightPanelModelMatrix);
            translateMatrix(rightPanelModelMatrix, 0.2, -0.2, 0);
            rotateZMatrix(rightPanelModelMatrix, 0);
            multiplyMatrix(rightPanelModelMatrix, stationModelMatrix, rightPanelModelMatrix);
            gl.uniformMatrix4fv(uniformLocations.modelMatrix, false, rightPanelModelMatrix);
            gl.drawElements(gl.TRIANGLES, solarPanel.indicesCount, gl.UNSIGNED_SHORT, 0);
            
            requestAnimationFrame(render);
        }
        
        // 隐藏加载界面
        loadingScreen.style.display = 'none';
        speedDisplay.textContent = orbitSpeed.toFixed(1) + 'x';
        periodValue.textContent = Math.round(90 / orbitSpeed);
        
        // 开始渲染
        requestAnimationFrame(render);
    }
    
    // 启动初始化
    init();
};