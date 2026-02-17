project(codec_core LANGUAGES CXX)

# Collect source files (excluding any old main.cpp if it's still there)
file(GLOB SRC_FILES "src/*.cpp")

add_library(codec_core STATIC ${SRC_FILES})

# This allows the app to find your headers easily
target_include_directories(codec_core PUBLIC inc)

add_subdirectory(tests)